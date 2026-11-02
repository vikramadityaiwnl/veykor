import type { ChatPermissionMode } from "@veykor/shared";
import type { ConversationMetadata } from "../chat/conversations.js";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { bodyLimit } from "hono/body-limit";
import { and, eq, gt } from "drizzle-orm";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { chatProviderFor, knownProviderIds, providerRegistration } from "../providers/index.js";
import { permissionModes } from "../providers/provider.js";
import { validChatRequest, hasNonImageAttachment } from "../chat/chat-validation.js";
import { db } from "../db/client.js";
import { conversations, sessions as authSessions } from "../db/schema.js";
import { listConversations, metadataSession, readConversation, writeConversation, validConversationLocation, projectFolder } from "../chat/conversations.js";
import { attachmentBytes, removeStaged } from "../chat/attachments.js";
import { getSettings } from "../settings/settings.js";

export const chatRoute = new Hono<AuthEnv>();
chatRoute.use("*", requireAuth);
chatRoute.use("*", bodyLimit({ maxSize: 80_000_000 }));

async function snapshots(userId: number) {
  return Promise.all(
    listConversations(userId).map(async (metadata) => {
      const live = await chatProviderFor(metadata.providerId)?.describe(
        userId,
        metadata.id,
      );

      return live || metadataSession(metadata);
    }),
  );
}

chatRoute.get("/providers/:providerId/sessions", async (c) => {
  const provider = chatProviderFor(c.req.param("providerId"));
  const projectId = c.req.query("projectId");

  if (!provider || !projectId) {
    return c.json(
      { error: "A supported provider and project are required" },
      400,
    );
  }

  try {
    const folder = projectFolder(c.get("user").id, projectId);
    return c.json(await provider.listSessions(folder, c.req.query("cursor")));
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to list provider sessions",
      },
      400,
    );
  }
});

chatRoute.get("/sessions", (c) =>
  c.json({
    sessions: listConversations(c.get("user").id).map(metadataSession),
  }),
);

chatRoute.get("/sessions/live", (c) =>
  streamSSE(c, async (stream) => {
    let previous = "";
    const deadline = Date.now() + 25_000;
    while (!stream.aborted && Date.now() < deadline) {
      const authenticated = db
        .select({ id: authSessions.id })
        .from(authSessions)
        .where(
          and(
            eq(authSessions.id, c.get("sessionId")),
            gt(authSessions.expiresAt, Math.floor(Date.now() / 1000)),
          ),
        )
        .get();
      if (!authenticated) {
        return;
      }
      const snapshot = JSON.stringify({
        sessions: await snapshots(c.get("user").id),
      });
      if (snapshot !== previous) {
        await stream.writeSSE({ event: "snapshot", data: snapshot });
        previous = snapshot;
      }
      await stream.sleep(200);
    }
  }),
);

chatRoute.put("/sessions", async (c) => {
  const input = await c.req.json().catch(() => null);
  if (!Array.isArray(input?.sessions) || input.sessions.length > 500) {
    return c.json({ error: "Invalid conversation metadata" }, 400);
  }
  const userId = c.get("user").id;
  const updates: ConversationMetadata[] = [];
  for (const candidate of input.sessions) {
    if (
      !candidate ||
      typeof candidate.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(candidate.id) ||
      typeof candidate.title !== "string" ||
      candidate.title.length > 200 ||
      !(
        candidate.projectId === null || typeof candidate.projectId === "string"
      ) ||
      !(
        candidate.sectionId === null || typeof candidate.sectionId === "string"
      ) ||
      !validConversationLocation(userId, candidate)
    ) {
      return c.json({ error: "Invalid conversation or project" }, 400);
    }
    const owner = db
      .select()
      .from(conversations)
      .where(eq(conversations.id, candidate.id))
      .get();
    if (owner && owner.userId !== userId) {
      return c.json({ error: "Conversation not found" }, 404);
    }
    const existing = readConversation(userId, candidate.id);
    if (
      existing &&
      (existing.projectId !== candidate.projectId ||
        existing.sectionId !== candidate.sectionId)
    ) {
      return c.json({ error: "Conversation location cannot be changed" }, 400);
    }
    const providerId =
      typeof candidate.providerId === "string" &&
      chatProviderFor(candidate.providerId)
        ? candidate.providerId
        : undefined;
    if (
      existing?.nativeSessionId &&
      providerId &&
      existing.providerId !== providerId
    ) {
      return c.json(
        { error: "Start a new chat to use a different provider" },
        409,
      );
    }

    updates.push(
      existing
        ? {
            ...existing,
            title: candidate.title,
            providerId:
              providerId ||
              (chatProviderFor(existing.providerId)
                ? existing.providerId
                : "muse"),
            modelId:
              typeof candidate.modelId === "string" &&
              /^[a-zA-Z0-9][a-zA-Z0-9._:@+/-]{0,199}$/.test(candidate.modelId)
                ? candidate.modelId
                : existing.modelId,
          }
        : {
            id: candidate.id,
            title: candidate.title,
            projectId: candidate.projectId || null,
            sectionId: candidate.sectionId || null,
            providerId: providerId || "muse",
            modelId:
              typeof candidate.modelId === "string" ? candidate.modelId : "",
            nativeSessionId: "",
            permissionMode: "promptUnmatched",
            attachments: [],
            turnTimings: {},
          },
    );
  }
  for (const metadata of updates) {
    writeConversation(userId, metadata);
  }
  return c.json({ sessions: await snapshots(userId) });
});

chatRoute.use("/sessions/:id/*", async (c, next) => {
  const conversation = readConversation(c.get("user").id, c.req.param("id")!);
  if (
    !conversation ||
    !validConversationLocation(c.get("user").id, conversation)
  ) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  await next();
});

chatRoute.get("/sessions/:id", async (c) => {
  const conversation = readConversation(c.get("user").id, c.req.param("id"));
  if (
    !conversation ||
    !validConversationLocation(c.get("user").id, conversation)
  ) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  const provider = chatProviderFor(conversation.providerId);
  const session = provider
    ? await provider.open(c.get("user").id, c.req.param("id"))
    : undefined;
  if (!session) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  return c.json({ session });
});

chatRoute.delete("/sessions/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const metadata = readConversation(userId, id);
  if (!metadata) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  const provider = chatProviderFor(metadata.providerId);
  if (provider?.isBusy(userId, id)) {
    return c.json({ error: "Stop the conversation before deleting it" }, 409);
  }
  await provider?.release(userId, id);
  await Promise.all(
    metadata.attachments.map((attachment) => removeStaged(attachment.id)),
  );
  db.delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .run();
  return c.json({ ok: true });
});

chatRoute.get("/sessions/:id/attachments/:attachmentId", async (c) => {
  const session = readConversation(c.get("user").id, c.req.param("id"))!;
  const attachment = session.attachments.find(
    (entry) => entry.id === c.req.param("attachmentId"),
  );
  const bytes = attachment ? await attachmentBytes(attachment.id) : undefined;
  if (!attachment || !bytes) {
    return c.json({ error: "Attachment not found" }, 404);
  }
  const inline = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
    "video/mp4",
    "video/quicktime",
  ].includes(attachment.mimeType);
  c.header("Content-Type", attachment.mimeType || "application/octet-stream");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Cache-Control", "private, no-store");
  c.header(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
  );
  return c.body(new Uint8Array(bytes));
});

chatRoute.post("/sessions/:id/mode", async (c) => {
  const input = await c.req.json().catch(() => null);
  if (!permissionModes.includes(input?.mode)) {
    return c.json({ error: "Invalid permission mode" }, 400);
  }
  const conversation = readConversation(c.get("user").id, c.req.param("id"));
  const provider = conversation
    ? chatProviderFor(conversation.providerId)
    : undefined;
  if (!provider) {
    return c.json({ error: "Chat provider unavailable" }, 400);
  }
  try {
    await provider.setPermissionMode(
      c.get("user").id,
      c.req.param("id"),
      input.mode as ChatPermissionMode,
    );
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Mode change failed" },
      409,
    );
  }
});

chatRoute.post("/sessions/:id/approval", async (c) => {
  const input = await c.req.json().catch(() => null);
  if (
    typeof input?.approvalId !== "string" ||
    typeof input?.choiceId !== "string"
  ) {
    return c.json({ error: "Invalid approval decision" }, 400);
  }
  const conversation = readConversation(c.get("user").id, c.req.param("id"));
  const provider = conversation
    ? chatProviderFor(conversation.providerId)
    : undefined;
  if (!provider) {
    return c.json({ error: "Chat provider unavailable" }, 400);
  }
  try {
    await provider.decideApproval(
      c.get("user").id,
      c.req.param("id"),
      input.approvalId,
      input.choiceId,
    );
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Approval failed" },
      409,
    );
  }
});

chatRoute.post("/sessions/:id/stop", async (c) => {
  const input = await c.req.json().catch(() => ({}));
  const conversation = readConversation(c.get("user").id, c.req.param("id"));
  const provider = conversation
    ? chatProviderFor(conversation.providerId)
    : undefined;
  if (!provider) {
    return c.json({ error: "Chat provider unavailable" }, 400);
  }
  try {
    await provider.stop(
      c.get("user").id,
      c.req.param("id"),
      input.cancel === true,
    );
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Stop failed" },
      409,
    );
  }
});

chatRoute.post("/", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);
  if (hasNonImageAttachment(input)) {
    return c.json({ error: "Only image files can be attached for now." }, 400);
  }
  if (!validChatRequest(input, knownProviderIds())) {
    return c.json(
      {
        error:
          "Choose a supported provider, permission mode and reasoning effort, and a nonempty message.",
      },
      400,
    );
  }
  const userId = c.get("user").id;
  const conversation = readConversation(userId, input.conversationId);
  if (!conversation || !validConversationLocation(userId, conversation)) {
    return c.json({ error: "Conversation or project not found" }, 404);
  }
  if (
    conversation.nativeSessionId &&
    conversation.providerId !== input.providerId
  ) {
    return c.json(
      { error: "Start a new chat to use a different provider" },
      409,
    );
  }

  const provider = chatProviderFor(input.providerId);
  if (!provider) {
    const label =
      providerRegistration(input.providerId)?.meta.label || "This provider";
    return c.json({ error: `Chat with ${label} is not supported yet.` }, 400);
  }
  if (provider.isBusy(userId, input.conversationId)) {
    return c.json({ error: "A reply is already running" }, 409);
  }
  const settings = await getSettings();
  const catalog = settings.providers.find(
    (entry) => entry.id === input.providerId,
  );
  if (
    !catalog?.available ||
    !catalog.models.some((model) => model.id === input.modelId)
  ) {
    return c.json({ error: catalog?.error || "Model unavailable" }, 400);
  }
  if (provider.isBusy(userId, input.conversationId)) {
    return c.json({ error: "A reply is already running" }, 409);
  }
  if (
    !conversation.nativeSessionId &&
    conversation.providerId !== input.providerId
  ) {
    conversation.providerId = input.providerId;
    writeConversation(userId, conversation);
  }

  void provider.runTurn(userId, input).catch((error) => {
    console.error("Chat provider failed before starting a turn", error);
  });
  return c.json({ accepted: true }, 202);
});
