import { compileAgentContext, agentTurnInput } from "../work/agent-context.js";
import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { and, desc, eq } from "drizzle-orm";
import type { SessionMcpServerConfig } from "@muse-code/sdk/dist/src/msp.js";
import { defaultChatTitle } from "@veykor/shared";
import type {
  ChatDetail,
  ChatPermission,
  ChatSummary,
  CreateChatRequest,
  DecideApprovalRequest,
  StartTurnRequest,
  SteerTurnRequest,
  UpdateChatRequest,
  UpdateChatSettingsRequest,
} from "@veykor/shared";
import { museHost } from "../muse/muse-host.js";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import { db } from "../db/client.js";
import { chats } from "../db/schema.js";
import {
  McpRestoreError,
  buildSessionMcp,
  restoreSessionMcp,
} from "../integrations/integrations.js";
import {
  applyChatSettings,
  cancelMuseTurn,
  decideMuseApproval,
  isMuseHostMissing,
  isMuseTurnRunning,
  leaveMuseSession,
  listMuseModels,
  listPendingApprovals,
  museErrorMessage,
  readMuseChat,
  runMuseTurn,
  startMuseSession,
  steerMuseTurn,
} from "../muse/chat-service.js";
import type { TurnEvent } from "../muse/chat-service.js";
import { readAgent, readProject } from "../work/work.js";
import type { AgentDefinition } from "@veykor/shared";

type ChatRow = typeof chats.$inferSelect;

const maxTitleLength = 100;

const maxSectionLength = 128;

const maxTextLength = 20000;

const maxImages = 4;

const maxImageBytes = 6 * 1024 * 1024;

const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function cleanTitle(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxTitleLength);
}

function cleanSection(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxSectionLength);
}

function toSummary(row: ChatRow): ChatSummary {
  const museSessionId = row.museSessionId ?? "";

  return {
    id: row.id,
    title: row.title ?? defaultChatTitle(),
    sectionId: row.sectionId ?? "recent",
    museSessionId,
    projectId: row.projectId,
    agentId:
      (JSON.parse(row.agentSnapshot) as Partial<AgentDefinition>).id ?? "",
    agentName:
      (JSON.parse(row.agentSnapshot) as Partial<AgentDefinition>).name ?? "",
    running: isMuseTurnRunning(museSessionId),
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

function readChat(userId: number, id: string): ChatRow | undefined {
  return db
    .select()
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.userId, userId)))
    .get();
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const parsed = (await c.req.json()) as unknown;

    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to empty input
  }

  return {};
}

function titleFromText(text: string): string {
  const firstLine = text.split("\n")[0].trim().replace(/\s+/g, " ");

  if (firstLine === "") {
    return defaultChatTitle();
  }

  return firstLine.slice(0, 60);
}

function readTurnImages(
  rawImages: Array<unknown>,
):
  | { images: Array<{ mediaType: string; base64Data: string }>; error: "" }
  | { images: []; error: string } {
  if (rawImages.length > maxImages) {
    return { images: [], error: "Attach at most four images." };
  }

  const images: Array<{ mediaType: string; base64Data: string }> = [];

  for (const raw of rawImages) {
    if (typeof raw !== "object" || raw === null) {
      return { images: [], error: "That attachment is invalid." };
    }

    const entry = raw as { mediaType?: unknown; base64Data?: unknown };

    if (
      typeof entry.mediaType !== "string" ||
      !imageTypes.has(entry.mediaType) ||
      typeof entry.base64Data !== "string" ||
      entry.base64Data === ""
    ) {
      return { images: [], error: "That attachment is invalid." };
    }

    let size = 0;

    try {
      size = Buffer.from(entry.base64Data, "base64").length;
    } catch {
      return { images: [], error: "That attachment is invalid." };
    }

    if (size === 0 || size > maxImageBytes) {
      return { images: [], error: "Each image must be under 6 MB." };
    }

    images.push({ mediaType: entry.mediaType, base64Data: entry.base64Data });
  }

  return { images, error: "" };
}

function museFailure(c: Context, cause: unknown) {
  if (cause instanceof McpRestoreError) {
    return c.json({ error: cause.message }, 502);
  }

  if (isMuseHostMissing(cause)) {
    return c.json({ error: "Muse is not installed on the server." }, 503);
  }

  return c.json({ error: museErrorMessage(cause) }, 502);
}

function withMcpTurnHint(event: TurnEvent): TurnEvent {
  if (event.type !== "turn-completed" || event.error === undefined) {
    return event;
  }

  if (!event.error.toLowerCase().includes("mcp")) {
    return event;
  }

  return {
    ...event,
    error:
      `${event.error} Check Integrations: a required MCP server may be ` +
      "unavailable. Disable it or set it to optional, then try again.",
  };
}

function mcpStartupHint(
  c: Context,
  cause: unknown,
  serverCount: number,
): Response | null {
  if (serverCount === 0 || isMuseHostMissing(cause)) {
    return null;
  }

  const message = museErrorMessage(cause);

  if (!message.toLowerCase().includes("mcp")) {
    return null;
  }

  return c.json(
    {
      error:
        `${message} Check Integrations: a required MCP server may be ` +
        "unavailable. Disable it or set it to optional, then try again.",
    },
    502,
  );
}

export const chatRoute = new Hono<AuthEnv>();

chatRoute.use("*", bodyLimit({ maxSize: 32 * 1024 * 1024 }));

chatRoute.get("/", requireAuth, (c) => {
  const rows = db
    .select()
    .from(chats)
    .where(eq(chats.userId, c.get("user").id))
    .orderBy(desc(chats.updatedAt))
    .all();

  return c.json(rows.map(toSummary));
});

chatRoute.post("/", requireAuth, async (c) => {
  const body = (await readJson(c)) as Partial<CreateChatRequest>;

  const sectionId = cleanSection(body.sectionId) || "recent";
  const title = cleanTitle(body.title) || defaultChatTitle();

  const userId = c.get("user").id;
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const project = projectId ? readProject(userId, projectId) : undefined;

  if (projectId && !project) {
    return c.json({ error: "Project not found." }, 404);
  }

  const agentId = typeof body.agentId === "string" ? body.agentId : "";
  const agent = agentId ? readAgent(userId, agentId) : undefined;

  if (
    project &&
    (!agent || !(JSON.parse(project.agentIds) as string[]).includes(agentId))
  ) {
    return c.json({ error: "Choose an agent assigned to this project." }, 400);
  }

  if (!project && agentId) {
    return c.json(
      { error: "Agents are only available in project sessions." },
      400,
    );
  }

  if (project) {
    try {
      if (!statSync(project.folder).isDirectory()) {
        throw new Error("missing");
      }
    } catch {
      return c.json(
        {
          error:
            "The project folder is unavailable. Check that it still exists on the host computer, then try again.",
        },
        400,
      );
    }
  }

  let museSessionId: string;

  const sessionMcp = buildSessionMcp(userId);
  const mcpServerCount = Object.keys(sessionMcp.runtime).length;

  try {
    const started = await startMuseSession(userId, project?.folder, {
      mcpServers: sessionMcp.runtime,
    });

    museSessionId = started.sessionId;

    if (agent) {
      await applyChatSettings({
        museSessionId,
        modelId: agent.modelId || undefined,
        providerId: agent.providerId || undefined,
        reasoningEffort: agent.reasoningEffort || undefined,
        permission: agent.permission,
      });
    }
  } catch (cause) {
    return mcpStartupHint(c, cause, mcpServerCount) ?? museFailure(c, cause);
  }

  const id = randomUUID();
  const stamp = nowIso();

  db.insert(chats)
    .values({
      id,
      userId: c.get("user").id,
      title,
      sectionId,
      projectId,
      agentSnapshot: JSON.stringify(agent ?? {}),
      agentContext: agent && project ? compileAgentContext(agent, project) : "",
      mcpSnapshot: JSON.stringify(sessionMcp.snapshot),
      museSessionId,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .run();

  const row = readChat(c.get("user").id, id);

  if (!row) {
    return c.json({ error: "Unable to create the chat." }, 500);
  }

  const response: ChatDetail = {
    chat: toSummary(row),
    activeTurnId: "",
    activeTurnStartedAt: 0,
    running: false,
    items: [],
    turnDurations: {},
    pendingApprovals: [],
    modelId: agent?.modelId ?? "",
    providerId: agent?.providerId ?? "",
    reasoningEffort: agent?.reasoningEffort ?? "",
    permission: agent?.permission ?? "read-only",
  };

  return c.json(response, 201);
});

chatRoute.get("/:id", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  try {
    const mcpServers = restoreSessionMcp(row.userId, row.mcpSnapshot ?? "[]");
    const detail = await readMuseChat(toSummary(row), { mcpServers });

    const response: ChatDetail = {
      chat: toSummary(row),
      ...detail,
    };

    return c.json(response);
  } catch (cause) {
    return museFailure(c, cause);
  }
});

chatRoute.get("/:id/events", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  let mcpServers: Record<string, SessionMcpServerConfig>;

  try {
    mcpServers = restoreSessionMcp(row.userId, row.mcpSnapshot ?? "[]");
  } catch (cause) {
    return museFailure(c, cause);
  }

  c.header("X-Accel-Buffering", "no");

  return streamSSE(c, async (stream) => {
    let dirty = true;
    let stopped = false;
    const unsubscribe = museHost.subscribe(row.museSessionId, () => {
      dirty = true;
    });

    stream.onAbort(() => {
      stopped = true;
      unsubscribe();
    });

    try {
      let lastSnapshot = "";
      let lastRefresh = 0;

      while (!stopped) {
        const refreshDue = Date.now() - lastRefresh > 5000;

        if (dirty || refreshDue) {
          dirty = false;
          const current = readChat(row.userId, row.id);

          if (!current) {
            break;
          }

          const detail: ChatDetail = {
            chat: toSummary(current),
            ...(await readMuseChat(toSummary(current), { mcpServers })),
          };
          const snapshot = JSON.stringify(detail);

          if (snapshot !== lastSnapshot || refreshDue) {
            await stream.writeSSE({ event: "snapshot", data: snapshot });
            lastSnapshot = snapshot;
          } else {
            await stream.writeSSE({ event: "heartbeat", data: "{}" });
          }

          lastRefresh = Date.now();
        }

        await stream.sleep(250);
      }
    } finally {
      unsubscribe();
    }
  });
});

chatRoute.patch("/:id", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  const body = (await readJson(c)) as Partial<UpdateChatRequest>;

  const title = cleanTitle(body.title);
  const sectionId = cleanSection(body.sectionId);

  db.update(chats)
    .set({
      title: title !== "" ? title : row.title,
      sectionId: sectionId !== "" ? sectionId : row.sectionId,
      updatedAt: nowIso(),
    })
    .where(and(eq(chats.id, row.id), eq(chats.userId, row.userId)))
    .run();

  const updated = readChat(row.userId, row.id);

  if (!updated) {
    return c.json({ error: "Chat not found" }, 404);
  }

  return c.json(toSummary(updated));
});

chatRoute.delete("/:id", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  try {
    await leaveMuseSession(toSummary(row).museSessionId);
  } catch {
    // Best effort; the listing is removed either way.
  }

  db.delete(chats)
    .where(and(eq(chats.id, row.id), eq(chats.userId, row.userId)))
    .run();

  return c.json({ deleted: true });
});

chatRoute.post("/:id/turns", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  const body = (await readJson(c)) as Partial<StartTurnRequest>;

  const text = typeof body.text === "string" ? body.text : "";

  if (text.length > maxTextLength) {
    return c.json({ error: "That message is too long." }, 400);
  }

  const rawImages = Array.isArray(body.images) ? body.images : [];
  const parsedImages = readTurnImages(rawImages);

  if (parsedImages.error !== "") {
    return c.json({ error: parsedImages.error }, 400);
  }

  const images = parsedImages.images;

  if (text.trim() === "" && images.length === 0) {
    return c.json({ error: "Write a message or attach an image first." }, 400);
  }

  const summary = toSummary(row);

  return streamSSE(c, async (stream) => {
    try {
      db.update(chats)
        .set({ updatedAt: nowIso() })
        .where(and(eq(chats.id, row.id), eq(chats.userId, row.userId)))
        .run();

      const turnInput = agentTurnInput(row.agentContext, text);

      await runMuseTurn({
        museSessionId: summary.museSessionId,
        ...turnInput,
        images,
        onEvent: async (event) => {
          if (!stream.aborted) {
            try {
              const outgoing = withMcpTurnHint(event);

              await stream.writeSSE({
                event: outgoing.type,
                data: JSON.stringify(outgoing),
              });
            } catch {
              return;
            }
          }
        },
      });

      const patch: { updatedAt: string; title?: string } = {
        updatedAt: nowIso(),
      };

      if (summary.title === defaultChatTitle() && text.trim() !== "") {
        patch.title = titleFromText(text);
      }

      db.update(chats)
        .set(patch)
        .where(and(eq(chats.id, row.id), eq(chats.userId, row.userId)))
        .run();
    } catch (cause) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          type: "error",
          message: museErrorMessage(cause),
        }),
      });
    }
  });
});

chatRoute.post("/:id/turns/:turnId/cancel", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  try {
    await cancelMuseTurn(toSummary(row).museSessionId, c.req.param("turnId"));

    return c.json({ cancelled: true });
  } catch (cause) {
    return museFailure(c, cause);
  }
});

chatRoute.post("/:id/steer", requireAuth, async (c) => {
  const body = (await readJson(c)) as Partial<SteerTurnRequest>;

  const text = typeof body.text === "string" ? body.text : "";

  if (text.length > maxTextLength) {
    return c.json({ error: "That message is too long." }, 400);
  }

  if (typeof body.expectedTurnId !== "string" || body.expectedTurnId === "") {
    return c.json({ error: "That turn is no longer running." }, 400);
  }

  const rawImages = Array.isArray(body.images) ? body.images : [];
  const parsedImages = readTurnImages(rawImages);

  if (parsedImages.error !== "") {
    return c.json({ error: parsedImages.error }, 400);
  }

  const images = parsedImages.images;

  if (text.trim() === "" && images.length === 0) {
    return c.json({ error: "Write a message or attach an image first." }, 400);
  }

  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  try {
    await steerMuseTurn({
      museSessionId: toSummary(row).museSessionId,
      expectedTurnId: body.expectedTurnId,
      text,
      images,
    });

    return c.json({ steered: true });
  } catch (cause) {
    return museFailure(c, cause);
  }
});

chatRoute.get("/:id/approvals", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  try {
    return c.json(await listPendingApprovals(toSummary(row).museSessionId));
  } catch (cause) {
    return museFailure(c, cause);
  }
});

chatRoute.post("/:id/approvals", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  const body = (await readJson(c)) as Partial<DecideApprovalRequest>;

  if (typeof body.approvalId !== "string" || body.approvalId === "") {
    return c.json({ error: "Pick an approval to decide." }, 400);
  }

  if (typeof body.choiceId !== "string" || body.choiceId === "") {
    return c.json({ error: "Pick a choice first." }, 400);
  }

  try {
    await decideMuseApproval({
      museSessionId: toSummary(row).museSessionId,
      approvalId: body.approvalId,
      choiceId: body.choiceId,
      feedback: typeof body.feedback === "string" ? body.feedback : undefined,
    });

    return c.json({ decided: true });
  } catch (cause) {
    return museFailure(c, cause);
  }
});

chatRoute.put("/:id/settings", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  if (row.projectId !== "") {
    try {
      const mcpServers = restoreSessionMcp(row.userId, row.mcpSnapshot ?? "[]");
      const detail = await readMuseChat(toSummary(row), { mcpServers });

      return c.json({ chat: toSummary(row), ...detail });
    } catch (cause) {
      return museFailure(c, cause);
    }
  }

  const body = (await readJson(c)) as Partial<UpdateChatSettingsRequest>;

  const permission: ChatPermission | undefined =
    body.permission === "read-only" ||
    body.permission === "approved" ||
    body.permission === "full-access"
      ? body.permission
      : undefined;

  try {
    await applyChatSettings({
      museSessionId: toSummary(row).museSessionId,
      modelId: typeof body.modelId === "string" ? body.modelId : undefined,
      providerId:
        typeof body.providerId === "string" ? body.providerId : undefined,
      reasoningEffort:
        typeof body.reasoningEffort === "string"
          ? body.reasoningEffort
          : undefined,
      permission,
    });

    const mcpServers = restoreSessionMcp(row.userId, row.mcpSnapshot ?? "[]");
    const detail = await readMuseChat(toSummary(row), { mcpServers });

    const response: ChatDetail = {
      chat: toSummary(row),
      ...detail,
    };

    return c.json(response);
  } catch (cause) {
    return museFailure(c, cause);
  }
});

export const modelRoute = new Hono<AuthEnv>();

modelRoute.get("/", requireAuth, async (c) => {
  const chatId = c.req.query("chatId");

  let museSessionId: string | undefined;

  if (chatId !== undefined && chatId !== "") {
    const row = readChat(c.get("user").id, chatId);

    if (!row) {
      return c.json({ error: "Chat not found" }, 404);
    }

    museSessionId = toSummary(row).museSessionId;
  }

  try {
    return c.json(await listMuseModels(museSessionId));
  } catch (cause) {
    return museFailure(c, cause);
  }
});
