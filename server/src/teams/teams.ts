import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { db } from "../db/client.js";
import { chats } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import { museErrorMessage, readMuseChat } from "../muse/chat-service.js";
import {
  chatSummary,
  delegateTeamMember,
  messageTeamMember,
  ownedChat,
  sessionMcp,
  teamRoot,
  teamRows,
  teamSnapshot,
  updateTeamTodos,
} from "./team-runtime.js";

async function readBody(c: Context): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => ({}));

  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export const teamRoute = new Hono<AuthEnv>();

teamRoute.use("*", bodyLimit({ maxSize: 128 * 1024 }));
teamRoute.use("*", requireAuth);
teamRoute.get("/:id", (c) => {
  const row = ownedChat(c.get("user").id, c.req.param("id"));

  if (!row || row.parentChatId) {
    return c.json({ error: "Chat not found." }, 404);
  }

  return c.json(teamSnapshot(row));
});

teamRoute.post("/:id/members", async (c) => {
  const row = ownedChat(c.get("user").id, c.req.param("id"));

  if (!row || row.parentChatId) {
    return c.json({ error: "Chat not found." }, 404);
  }

  const body = await readBody(c);

  if (typeof body.agentId !== "string" || typeof body.task !== "string") {
    return c.json({ error: "Choose an agent and describe its task." }, 400);
  }

  try {
    return c.json(await delegateTeamMember(row, body.agentId, body.task), 201);
  } catch (cause) {
    return c.json({ error: museErrorMessage(cause) }, 400);
  }
});

const tools = [
  {
    name: "team_read",
    description:
      "Read this chat's team roster, assigned tasks, status, interruptions, messages and results. Agent IDs listed in availableAgents can be used to delegate.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "team_delegate",
    description:
      "Assign concrete work to an assigned teammate. Reuses its single existing session in this chat, or creates it on first use. Returns queued status immediately; queued does not mean the work has run. Use this instead of native subagents. Completion is delivered automatically to you and the main chat.",
    inputSchema: {
      type: "object",
      properties: { agentId: { type: "string" }, task: { type: "string" } },
      required: ["agentId", "task"],
      additionalProperties: false,
    },
  },
  {
    name: "team_message",
    description:
      "Send a task, plan, feedback or result to another member of this chat. Delivery is queued durably and starts a dedicated turn after current work finishes. Stopped members stay stopped until the user resumes them.",
    inputSchema: {
      type: "object",
      properties: { memberId: { type: "string" }, message: { type: "string" } },
      required: ["memberId", "message"],
      additionalProperties: false,
    },
  },
  {
    name: "team_update_todos",
    description:
      "Replace your own todo checklist. Other teammates keep separate lists and can see yours through team_read. Update statuses as work progresses; send an empty array to clear only your own list.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string", minLength: 1, maxLength: 1000 },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "cancelled"],
              },
            },
            required: ["text", "status"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  {
    name: "team_read_session",
    description:
      "Read the persisted transcript and pending approvals of another member of this team.",
    inputSchema: {
      type: "object",
      properties: { memberId: { type: "string" } },
      required: ["memberId"],
      additionalProperties: false,
    },
  },
];

export const teamMcpRoute = new Hono();

teamMcpRoute.use("*", bodyLimit({ maxSize: 128 * 1024 }));
teamMcpRoute.post("/:id", async (c) => {
  const row = db
    .select()
    .from(chats)
    .where(eq(chats.id, c.req.param("id")))
    .get();
  const provided = c.req.header("Authorization") ?? "";
  const expected = `Bearer ${row?.teamToken ?? ""}`;

  if (
    !row?.teamToken ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readBody(c);
  const id = body.id;

  if (id === undefined) {
    return c.body(null, 202);
  }

  const respond = (result: unknown) => c.json({ jsonrpc: "2.0", id, result });

  if (body.method === "initialize") {
    return respond({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "veykor-team", version: "1.0.0" },
    });
  }

  if (body.method === "ping") {
    return respond({});
  }

  if (body.method === "tools/list") {
    return respond({ tools });
  }

  if (body.method !== "tools/call") {
    return c.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    });
  }

  try {
    const params = body.params as
      { name?: string; arguments?: Record<string, unknown> } | undefined;
    const args = params?.arguments ?? {};
    let result: unknown;

    if (params?.name === "team_read") {
      result = teamSnapshot(row);
    } else if (params?.name === "team_delegate") {
      if (typeof args.agentId !== "string" || typeof args.task !== "string") {
        throw new Error("agentId and task are required.");
      }

      result = await delegateTeamMember(row, args.agentId, args.task);
    } else if (params?.name === "team_message") {
      if (
        typeof args.memberId !== "string" ||
        typeof args.message !== "string" ||
        !args.message.trim() ||
        args.message.length > 20000
      ) {
        throw new Error(
          "memberId and a message under 20,000 characters are required.",
        );
      }

      result = messageTeamMember(row, args.memberId, args.message);
    } else if (params?.name === "team_update_todos") {
      result = { todos: updateTeamTodos(row, args.items) };
    } else if (params?.name === "team_read_session") {
      const member = teamRows(row).find((entry) => entry.id === args.memberId);

      if (!member || teamRoot(member) !== teamRoot(row)) {
        throw new Error("That session is not a member of this team.");
      }

      result = await readMuseChat(chatSummary(member), {
        mcpServers: sessionMcp(member),
      });
    } else {
      throw new Error("Unknown team tool.");
    }

    return respond({
      content: [{ type: "text", text: JSON.stringify(result) }],
    });
  } catch (cause) {
    return respond({
      isError: true,
      content: [{ type: "text", text: museErrorMessage(cause) }],
    });
  }
});
