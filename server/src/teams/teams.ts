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
import { imageGenerationAvailable } from "../images/image-service.js";
import {
  callGenerateImageTool,
  generateImageToolDefinition,
} from "../images/images.js";
import { generateImageToolName } from "@veykor/shared";
import {
  MemoryFailure,
  deleteMemory,
  eligibleMemoryRows,
  listMemories,
  saveConversationMemory,
  updateConversationMemory,
} from "../memory/memory-service.js";
import {
  chatSummary,
  delegateTeamMember,
  messageTeamMember,
  ownedChat,
  recordTeamEvent,
  sessionMcp,
  teamRoot,
  teamRows,
  teamSnapshot,
  updateTeamTodos,
} from "./team-runtime.js";
import {
  createQuestionRequest,
  questionAskedText,
  waitForSettlement,
} from "../questions/question-store.js";
import { questionToolGuidance } from "@veykor/shared";

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
    name: "ask_user",
    description: `Ask the user concise clarification questions through a structured prompt. This call waits until the user answers or cancels, then returns the answers.\n\n${questionToolGuidance}`,
    inputSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "Unique id for this question: letters, numbers, underscore, or hyphen, at most 64 characters.",
              },
              question: {
                type: "string",
                description:
                  "The full question text shown to the user, under 500 characters.",
              },
              options: {
                type: "array",
                maxItems: 5,
                description:
                  "Two to five suggested options, or an empty array for a free-text-only question.",
                items: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description:
                        "Unique option id within this question: letters, numbers, underscore, or hyphen.",
                    },
                    label: {
                      type: "string",
                      description:
                        "Short option label shown to the user, under 80 characters.",
                    },
                    description: {
                      type: "string",
                      description:
                        "Optional tradeoff explanation, under 240 characters.",
                    },
                  },
                  required: ["id", "label"],
                  additionalProperties: false,
                },
              },
              recommendedOptionId: {
                type: "string",
                description:
                  "Optional id of the recommended option. Only recommend with a defensible reason.",
              },
            },
            required: ["id", "question"],
            additionalProperties: false,
          },
        },
      },
      required: ["questions"],
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
  {
    name: "memory_save",
    description:
      "Persist a durable user preference, rule, or procedure for future chats. Use only for clear instructions intended for future use such as remember this, always do this for this project, or an unambiguous ongoing preference. Inside a project default to project scope; use global only when the user clearly wants it across projects or chats. Never save credentials, secrets, temporary task instructions, quoted text, tool output, or speculation. Only claim a memory was saved after this tool succeeds.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string", minLength: 1, maxLength: 2000 },
        scope: { type: "string", enum: ["global", "project"] },
        sourceMessageId: { type: "string", maxLength: 200 },
        excerpt: { type: "string", maxLength: 500 },
        idempotencyKey: { type: "string", maxLength: 200 },
      },
      required: ["instruction", "scope"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_list",
    description:
      "List saved memories available to this chat. Global memories apply across chats; project memories apply only within this chat's project.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 500 },
        scope: { type: "string", enum: ["global", "project"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "memory_update",
    description:
      "Update a saved memory when an explicit correction clearly replaces it. Preserve the original meaning unless the user explicitly changes it. Do not overwrite unrelated instructions on vague similarity.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, maxLength: 200 },
        instruction: { type: "string", minLength: 1, maxLength: 2000 },
        scope: { type: "string", enum: ["global", "project"] },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_delete",
    description:
      "Delete a saved memory that the user explicitly asked to forget. Use only on explicit instruction.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", minLength: 1, maxLength: 200 } },
      required: ["id"],
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
    return respond({
      tools: imageGenerationAvailable()
        ? [...tools, generateImageToolDefinition]
        : tools,
    });
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
    } else if (params?.name === "ask_user") {
      const created = createQuestionRequest(row, args, String(id));

      if (!created.duplicate) {
        recordTeamEvent(
          row,
          "question-asked",
          questionAskedText(created.record),
        );
      }

      const settlement = await waitForSettlement(
        created.record.id,
        c.req.raw.signal,
      );

      if (settlement.status === "answered") {
        result = {
          requestId: created.record.id,
          status: "answered",
          answers: settlement.answers,
          ...(settlement.notice === "" ? {} : { notice: settlement.notice }),
        };
      } else {
        result = {
          requestId: created.record.id,
          status: "cancelled",
          reason:
            settlement.reason === ""
              ? "The user cancelled this question without answering."
              : settlement.reason,
        };
      }
    } else if (params?.name === "team_read_session") {
      const member = teamRows(row).find((entry) => entry.id === args.memberId);

      if (!member || teamRoot(member) !== teamRoot(row)) {
        throw new Error("That session is not a member of this team.");
      }

      result = await readMuseChat(chatSummary(member), {
        mcpServers: sessionMcp(member),
      });
    } else if (params?.name === "memory_save") {
      if (
        typeof args.instruction !== "string" ||
        args.instruction.trim() === "" ||
        args.instruction.length > 2000 ||
        (args.scope !== "global" && args.scope !== "project")
      ) {
        throw new Error(
          "instruction under 2,000 characters and a global or project scope are required.",
        );
      }

      if (
        (args.sourceMessageId !== undefined &&
          typeof args.sourceMessageId !== "string") ||
        (typeof args.sourceMessageId === "string" &&
          args.sourceMessageId.length > 200) ||
        (args.excerpt !== undefined && typeof args.excerpt !== "string") ||
        (typeof args.excerpt === "string" && args.excerpt.length > 500) ||
        (args.idempotencyKey !== undefined &&
          typeof args.idempotencyKey !== "string") ||
        (typeof args.idempotencyKey === "string" &&
          args.idempotencyKey.length > 200)
      ) {
        throw new Error("That memory metadata is invalid.");
      }

      if (args.scope === "project" && row.projectId === "") {
        throw new Error(
          "Project memories need a project chat. Use global scope here.",
        );
      }

      try {
        const saved = saveConversationMemory(row.userId, {
          instruction: args.instruction,
          scope: args.scope,
          projectId: row.projectId,
          sourceChatId: row.id,
          sourceMessageId:
            typeof args.sourceMessageId === "string"
              ? args.sourceMessageId
              : "",
          excerpt: typeof args.excerpt === "string" ? args.excerpt : "",
          idempotencyKey:
            typeof args.idempotencyKey === "string" ? args.idempotencyKey : "",
        });

        result = {
          memory: saved.summary,
          reused: saved.reused,
          receipt: saved.receipt,
        };
      } catch (cause) {
        if (cause instanceof MemoryFailure) {
          throw new Error(cause.message);
        }

        throw cause;
      }
    } else if (params?.name === "memory_list") {
      if (
        (args.query !== undefined && typeof args.query !== "string") ||
        (typeof args.query === "string" && args.query.length > 500) ||
        (args.scope !== undefined &&
          args.scope !== "global" &&
          args.scope !== "project")
      ) {
        throw new Error("That memory query is invalid.");
      }

      const scope =
        args.scope === "global" || args.scope === "project"
          ? args.scope
          : undefined;

      if (scope === "project" && row.projectId === "") {
        result = { memories: [] };
      } else {
        const listed = listMemories(row.userId, {
          scope,
          projectId: scope === "project" ? row.projectId : undefined,
          query: typeof args.query === "string" ? args.query : "",
        });

        if (scope === undefined) {
          const eligible = new Set(
            eligibleMemoryRows(row.userId, row.projectId).map(
              (entry) => entry.id,
            ),
          );

          result = {
            memories: listed.memories.filter((entry) => eligible.has(entry.id)),
          };
        } else {
          result = listed;
        }
      }
    } else if (params?.name === "memory_update") {
      if (
        typeof args.id !== "string" ||
        args.id === "" ||
        args.id.length > 200
      ) {
        throw new Error("A memory id is required.");
      }

      if (
        (args.instruction !== undefined &&
          (typeof args.instruction !== "string" ||
            args.instruction.trim() === "" ||
            args.instruction.length > 2000)) ||
        (args.scope !== undefined &&
          args.scope !== "global" &&
          args.scope !== "project")
      ) {
        throw new Error("That memory update is invalid.");
      }

      if (args.instruction === undefined && args.scope === undefined) {
        throw new Error("Provide an instruction or scope to update.");
      }

      if (args.scope === "project" && row.projectId === "") {
        throw new Error(
          "Project memories need a project chat. Use global scope here.",
        );
      }

      try {
        const updated = updateConversationMemory(row.userId, args.id, {
          instruction:
            typeof args.instruction === "string" ? args.instruction : undefined,
          scope:
            args.scope === "global" || args.scope === "project"
              ? args.scope
              : undefined,
          projectId: row.projectId,
        });

        result = {
          memory: updated.summary,
          receipt: updated.receipt,
        };
      } catch (cause) {
        if (cause instanceof MemoryFailure) {
          throw new Error(cause.message);
        }

        throw cause;
      }
    } else if (params?.name === generateImageToolName) {
      result = await callGenerateImageTool(row, args, String(id));
    } else if (params?.name === "memory_delete") {
      if (
        typeof args.id !== "string" ||
        args.id === "" ||
        args.id.length > 200
      ) {
        throw new Error("A memory id is required.");
      }

      try {
        deleteMemory(row.userId, args.id);
        result = { deleted: true };
      } catch (cause) {
        if (cause instanceof MemoryFailure) {
          throw new Error(cause.message);
        }

        throw cause;
      }
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
