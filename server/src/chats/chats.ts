import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { and, desc, eq } from "drizzle-orm";
import { defaultChatTitle } from "@veykor/shared";
import type {
  ChatDetail,
  ChatPermission,
  ChatSummary,
  CreateChatRequest,
  DecideApprovalRequest,
  StartTurnRequest,
  UpdateChatRequest,
  UpdateChatSettingsRequest,
} from "@veykor/shared";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import { db } from "../db/client.js";
import { chats } from "../db/schema.js";
import {
  applyChatSettings,
  cancelMuseTurn,
  decideMuseApproval,
  isMuseHostMissing,
  listMuseModels,
  listPendingApprovals,
  museErrorMessage,
  readMuseChat,
  runMuseTurn,
  startMuseSession,
} from "../muse/chat-service.js";

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
  return {
    id: row.id,
    title: row.title ?? defaultChatTitle(),
    sectionId: row.sectionId ?? "recent",
    museSessionId: row.museSessionId ?? "",
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

function museFailure(c: Context, cause: unknown) {
  if (isMuseHostMissing(cause)) {
    return c.json({ error: "Muse is not installed on the server." }, 503);
  }

  return c.json({ error: museErrorMessage(cause) }, 502);
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

  let museSessionId: string;

  try {
    const started = await startMuseSession(c.get("user").id);

    museSessionId = started.sessionId;
  } catch (cause) {
    return museFailure(c, cause);
  }

  const id = randomUUID();
  const stamp = nowIso();

  db.insert(chats)
    .values({
      id,
      userId: c.get("user").id,
      title,
      sectionId,
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
    items: [],
    pendingApprovals: [],
    modelId: "",
    providerId: "",
    reasoningEffort: "",
    permission: "read-only",
  };

  return c.json(response, 201);
});

chatRoute.get("/:id", requireAuth, async (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  try {
    const detail = await readMuseChat(toSummary(row));

    const response: ChatDetail = {
      chat: toSummary(row),
      ...detail,
    };

    return c.json(response);
  } catch (cause) {
    return museFailure(c, cause);
  }
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

chatRoute.delete("/:id", requireAuth, (c) => {
  const row = readChat(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
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

  if (rawImages.length > maxImages) {
    return c.json({ error: "Attach at most four images." }, 400);
  }

  const images: Array<{ mediaType: string; base64Data: string }> = [];

  for (const raw of rawImages) {
    if (typeof raw !== "object" || raw === null) {
      return c.json({ error: "That attachment is invalid." }, 400);
    }

    const entry = raw as { mediaType?: unknown; base64Data?: unknown };

    if (
      typeof entry.mediaType !== "string" ||
      !imageTypes.has(entry.mediaType) ||
      typeof entry.base64Data !== "string" ||
      entry.base64Data === ""
    ) {
      return c.json({ error: "That attachment is invalid." }, 400);
    }

    let size = 0;

    try {
      size = Buffer.from(entry.base64Data, "base64").length;
    } catch {
      return c.json({ error: "That attachment is invalid." }, 400);
    }

    if (size === 0 || size > maxImageBytes) {
      return c.json({ error: "Each image must be under 6 MB." }, 400);
    }

    images.push({ mediaType: entry.mediaType, base64Data: entry.base64Data });
  }

  if (text.trim() === "" && images.length === 0) {
    return c.json({ error: "Write a message or attach an image first." }, 400);
  }

  const summary = toSummary(row);

  return streamSSE(c, async (stream) => {
    try {
      await runMuseTurn({
        museSessionId: summary.museSessionId,
        text,
        images,
        onEvent: async (event) => {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });
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

    const detail = await readMuseChat(toSummary(row));

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
