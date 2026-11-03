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
import { listOrdinaryConversations, isInternalConversation, listInternalConversations, metadataSession, readConversation, writeConversation, validConversationLocation, projectFolder } from "../chat/conversations.js";
import { activeTaskForSession, listParticipants } from "../collab/store.js";
import { agentNameFor } from "../collab/sessions.js";
import { recordDelegateInstruction } from "../collab/human.js";
import { requestInterruption } from "../collab/interruption.js";
import { parseDelegateStopCommand, parseMainStopCommand } from "../collab/stop-commands.js";
import { deleteCollaborationTree } from "../collab/routes.js";
import { attachmentBytes, removeStaged } from "../chat/attachments.js";
import { withQueue, hasSubmittedMessages, submitMessage, pauseQueue, editQueuedMessage, deleteQueuedMessage, steerQueuedMessage } from "../chat/message-queue.js";
import { LiveSnapshotTracker } from "../chat/live-cursor.js";
import { isReasoningEffort } from "../providers/reasoning-effort.js";
import { getSettings } from "../settings/settings.js";
import { readAgent } from "../agents/store.js";
import { agentCapabilityIssues, buildAgentSnapshot } from "../agents/agent-config.js";

const liveSnapshots = new LiveSnapshotTracker();

export const chatRoute = new Hono<AuthEnv>();
chatRoute.use("*", requireAuth);
chatRoute.use("*", bodyLimit({ maxSize: 80_000_000 }));

async function snapshots(userId: number) {
  return Promise.all(
    listOrdinaryConversations(userId).map(async (metadata) => {
      const live = await chatProviderFor(metadata.providerId)?.describe(
        userId,
        metadata.id,
      );

      return withQueue(userId, live || metadataSession(metadata));
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
    sessions: listOrdinaryConversations(c.get("user").id).map((metadata) =>
      withQueue(c.get("user").id, metadataSession(metadata)),
    ),
  }),
);

chatRoute.get("/sessions/live", (c) =>
  streamSSE(c, async (stream) => {
    const userId = c.get("user").id;
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
      const sessions = await snapshots(userId);
      const snapshotJson = JSON.stringify({ sessions });
      if (snapshotJson !== previous) {
        previous = snapshotJson;
        const cursor = liveSnapshots.cursorFor(userId, snapshotJson);
        await stream.writeSSE({
          id: cursor,
          event: "snapshot",
          data: JSON.stringify({ sessions, cursor }),
        });
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
    if (existing && isInternalConversation(existing)) {
      continue;
    }
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
      existing &&
      (existing.nativeSessionId || hasSubmittedMessages(userId, existing.id)) &&
      providerId &&
      existing.providerId !== providerId
    ) {
      return c.json(
        { error: "Start a new chat to use a different provider" },
        409,
      );
    }
    const started = !!(
      existing &&
      (existing.nativeSessionId || hasSubmittedMessages(userId, existing.id))
    );
    let agentId: string | null | undefined;
    let agentName = existing?.agentName || "";
    let agentProviderId: string | undefined;
    let agentModelId: string | undefined;
    let agentEffort: string | undefined;
    let agentPermission: ConversationMetadata["permissionMode"] | undefined;

    if (candidate.agentId !== undefined) {
      if (candidate.agentId !== null && typeof candidate.agentId !== "string") {
        return c.json({ error: "Invalid agent" }, 400);
      }

      agentId = candidate.projectId ? candidate.agentId : null;

      if (started && (existing?.agentId ?? null) !== agentId) {
        return c.json(
          { error: "Start a new chat to use a different agent" },
          409,
        );
      }

      if (agentId && (!existing || agentId !== existing.agentId)) {
        const agent = readAgent(userId, agentId);

        if (
          !agent ||
          !candidate.projectId ||
          !agent.projectIds.includes(candidate.projectId)
        ) {
          return c.json(
            { error: "Agent is not available for this project" },
            400,
          );
        }

        agentName = agent.name;
        agentProviderId = agent.providerId;
        agentModelId = agent.modelId;
        agentEffort = agent.reasoningEffort;
        agentPermission = agent.permissionMode;
      }
    }

    updates.push(
      existing
        ? {
            ...existing,
            title: candidate.title,
            providerId:
              agentProviderId ||
              providerId ||
              (chatProviderFor(existing.providerId)
                ? existing.providerId
                : "muse"),
            modelId:
              agentModelId ||
              (typeof candidate.modelId === "string" &&
              /^[a-zA-Z0-9][a-zA-Z0-9._:@+/-]{0,199}$/.test(candidate.modelId)
                ? candidate.modelId
                : existing.modelId),
            reasoningEffort:
              agentEffort !== undefined
                ? agentEffort
                : isReasoningEffort(candidate.reasoningEffort)
                  ? candidate.reasoningEffort
                  : existing.reasoningEffort || "",
            permissionMode:
              !started &&
              agentId !== undefined &&
              agentId !== (existing.agentId ?? null)
                ? permissionModes.includes(candidate.permissionMode)
                  ? candidate.permissionMode
                  : agentPermission || existing.permissionMode
                : existing.permissionMode,
            agentId:
              agentId !== undefined ? agentId : (existing.agentId ?? null),
            agentName:
              agentId !== undefined ? agentName : existing.agentName || "",
            agentSnapshot:
              agentId !== undefined && agentId !== (existing.agentId ?? null)
                ? null
                : (existing.agentSnapshot ?? null),
          }
        : {
            id: candidate.id,
            title: candidate.title,
            projectId: candidate.projectId || null,
            sectionId: candidate.sectionId || null,
            providerId: agentProviderId || providerId || "muse",
            modelId:
              agentModelId ||
              (typeof candidate.modelId === "string" ? candidate.modelId : ""),
            reasoningEffort:
              agentEffort !== undefined
                ? agentEffort
                : isReasoningEffort(candidate.reasoningEffort)
                  ? candidate.reasoningEffort
                  : "",
            nativeSessionId: "",
            permissionMode:
              agentId && permissionModes.includes(candidate.permissionMode)
                ? candidate.permissionMode
                : agentPermission || "promptUnmatched",
            agentId: agentId ?? null,
            agentName,
            agentSnapshot: null,
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
    !validConversationLocation(c.get("user").id, conversation) ||
    isInternalConversation(conversation)
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
  return c.json({ session: withQueue(c.get("user").id, session) });
});

chatRoute.delete("/sessions/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const metadata = readConversation(userId, id);
  if (!metadata) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  if (isInternalConversation(metadata)) {
    return c.json(
      { error: "Delete the main chat to remove its collaboration" },
      400,
    );
  }
  const provider = chatProviderFor(metadata.providerId);
  const internalBusy = listInternalConversations(userId, id).some((entry) =>
    chatProviderFor(entry.providerId)?.isBusy(userId, entry.id),
  );
  if (provider?.isBusy(userId, id) || internalBusy) {
    return c.json({ error: "Stop the conversation before deleting it" }, 409);
  }
  await provider?.release(userId, id);
  await Promise.all(
    metadata.attachments.map((attachment) => removeStaged(attachment.id)),
  );
  await deleteCollaborationTree(userId, id);
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

chatRoute.patch("/sessions/:id/queue/:messageId", async (c) => {
  const input = await c.req.json().catch(() => null);

  if (
    typeof input?.text !== "string" ||
    !input.text.trim() ||
    input.text.length > 100_000
  ) {
    return c.json(
      { error: "Enter a message of at most 100,000 characters" },
      400,
    );
  }

  try {
    editQueuedMessage(
      c.get("user").id,
      c.req.param("id"),
      c.req.param("messageId"),
      input.text.trim(),
    );
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to edit message",
      },
      409,
    );
  }
});

chatRoute.delete("/sessions/:id/queue/:messageId", (c) => {
  try {
    deleteQueuedMessage(
      c.get("user").id,
      c.req.param("id"),
      c.req.param("messageId"),
    );
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to remove message",
      },
      409,
    );
  }
});

chatRoute.post("/sessions/:id/queue/:messageId/steer", async (c) => {
  try {
    await steerQueuedMessage(
      c.get("user").id,
      c.req.param("id"),
      c.req.param("messageId"),
    );
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to steer message",
      },
      409,
    );
  }
});

chatRoute.post("/sessions/:id/mode", async (c) => {
  const input = await c.req.json().catch(() => null);
  if (!permissionModes.includes(input?.mode)) {
    return c.json({ error: "Invalid permission mode" }, 400);
  }
  const conversation = readConversation(c.get("user").id, c.req.param("id"));
  if (conversation && isInternalConversation(conversation)) {
    return c.json(
      { error: "Delegate permissions come from its agent configuration" },
      400,
    );
  }
  const provider = conversation
    ? chatProviderFor(conversation.providerId)
    : undefined;
  if (!provider || !conversation) {
    return c.json({ error: "Chat provider unavailable" }, 400);
  }
  if (
    !conversation.nativeSessionId &&
    !hasSubmittedMessages(c.get("user").id, conversation.id)
  ) {
    writeConversation(c.get("user").id, {
      ...conversation,
      permissionMode: input.mode as ChatPermissionMode,
    });
    return c.json({ ok: true });
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

chatRoute.post("/sessions/:id/settings", async (c) => {
  const input = await c.req.json().catch(() => null);
  if (!isReasoningEffort(input?.reasoningEffort)) {
    return c.json({ error: "Invalid reasoning effort" }, 400);
  }
  const conversation = readConversation(c.get("user").id, c.req.param("id"));
  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  if (isInternalConversation(conversation)) {
    return c.json(
      { error: "Delegate settings come from its agent configuration" },
      400,
    );
  }
  writeConversation(c.get("user").id, {
    ...conversation,
    reasoningEffort: input.reasoningEffort,
  });
  return c.json({ ok: true });
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
  if (
    conversation &&
    isInternalConversation(conversation) &&
    activeTaskForSession(c.get("user").id, conversation.id)
  ) {
    return c.json(
      { error: "Use the delegate Stop control to stop this agent" },
      400,
    );
  }
  const provider = conversation
    ? chatProviderFor(conversation.providerId)
    : undefined;
  if (!provider) {
    return c.json({ error: "Chat provider unavailable" }, 400);
  }
  try {
    pauseQueue(c.get("user").id, c.req.param("id"), true);
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
    (conversation.nativeSessionId ||
      hasSubmittedMessages(userId, conversation.id)) &&
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
  const latest = readConversation(userId, input.conversationId);
  if (!latest || !validConversationLocation(userId, latest)) {
    return c.json({ error: "Conversation or project not found" }, 404);
  }
  if (
    (latest.nativeSessionId || hasSubmittedMessages(userId, latest.id)) &&
    latest.providerId !== input.providerId
  ) {
    return c.json(
      { error: "Start a new chat to use a different provider" },
      409,
    );
  }
  if (latest.providerId !== input.providerId) {
    latest.providerId = input.providerId;
    writeConversation(userId, latest);
  }

  const userText = input.messages.at(-1)?.text || "";

  if (isInternalConversation(latest) && latest.parentConversationId) {
    const parentId = latest.parentConversationId;
    const participants = listParticipants(userId, parentId);
    const self =
      participants.find((entry) => entry.conversationId === latest.id) || null;
    const others = participants
      .filter(
        (entry) =>
          entry.role === "delegate" && entry.conversationId !== latest.id,
      )
      .map((entry) => ({
        conversationId: entry.conversationId,
        agentName: entry.agentName,
      }));
    const parsed = parseDelegateStopCommand(
      userText,
      {
        conversationId: latest.id,
        agentName:
          self?.agentName || agentNameFor(userId, latest.id, "Delegate"),
      },
      others,
    );

    if (parsed.action === "stop") {
      try {
        const { task } = await requestInterruption({
          userId,
          conversationId: parsed.conversationId,
          instructionText: userText,
          sourceKind: "human",
          sourceConversationId: latest.id,
          sourceName: "You",
        });

        return c.json(
          {
            accepted: true,
            interruption: {
              taskId: task.id,
              state: task.state,
              interruptState: task.interruptState,
            },
          },
          202,
        );
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "Unable to stop" },
          400,
        );
      }
    }

    recordDelegateInstruction({
      userId,
      delegateConversationId: latest.id,
      text: userText,
      attachments: (input.messages.at(-1)?.attachments || []).map(
        (attachment) => ({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          kind: attachment.kind,
        }),
      ),
    });
  } else if (latest.projectId) {
    const delegates = listParticipants(userId, latest.id)
      .filter((entry) => entry.role === "delegate")
      .map((entry) => ({
        conversationId: entry.conversationId,
        agentName: entry.agentName,
      }));

    if (delegates.length > 0) {
      const parsed = parseMainStopCommand(userText, delegates);

      if (parsed.action === "stop") {
        const active = activeTaskForSession(userId, parsed.conversationId);

        if (!active) {
          return c.json(
            { error: `${parsed.agentName} has no active task to stop.` },
            400,
          );
        }

        try {
          const { task } = await requestInterruption({
            userId,
            conversationId: parsed.conversationId,
            instructionText: userText,
            sourceKind: "human",
            sourceConversationId: latest.id,
            sourceName: "You",
          });

          return c.json(
            {
              accepted: true,
              interruption: {
                taskId: task.id,
                state: task.state,
                interruptState: task.interruptState,
              },
            },
            202,
          );
        } catch (error) {
          return c.json(
            {
              error: error instanceof Error ? error.message : "Unable to stop",
            },
            400,
          );
        }
      }

      if (parsed.action === "ask") {
        return c.json(
          {
            error:
              parsed.candidates.length > 0
                ? `Which agent should stop? Say ${parsed.candidates.map((name) => `"stop ${name}"`).join(" or ")}.`
                : "There is no active delegate to stop.",
          },
          409,
        );
      }
    }
  }

  if (latest.projectId && !latest.agentSnapshot) {
    const started =
      !!latest.nativeSessionId || hasSubmittedMessages(userId, latest.id);

    if (!started) {
      const agent = latest.agentId ? readAgent(userId, latest.agentId) : null;

      if (!agent || !agent.projectIds.includes(latest.projectId)) {
        return c.json(
          { error: "Choose an agent for this project chat before sending." },
          400,
        );
      }

      const issues = agentCapabilityIssues(agent);

      if (issues.length > 0) {
        return c.json({ error: issues[0] }, 400);
      }

      const agentCatalog = settings.providers.find(
        (entry) => entry.id === agent.providerId,
      );
      const agentModel = agentCatalog?.models.find(
        (entry) => entry.id === agent.modelId,
      );

      if (!agentCatalog?.available || !agentModel) {
        return c.json(
          { error: agentCatalog?.error || "Agent model unavailable" },
          400,
        );
      }

      if (
        agent.reasoningEffort &&
        !agentModel.reasoningEfforts.some(
          (option) => option.tier === agent.reasoningEffort,
        )
      ) {
        return c.json(
          {
            error: "The agent reasoning effort is not supported by its model.",
          },
          400,
        );
      }

      const snapshot = buildAgentSnapshot(agent, agentModel);
      latest.agentSnapshot = snapshot;
      latest.agentName = snapshot.name;
      latest.providerId = snapshot.providerId;
      latest.modelId = snapshot.modelId;
      latest.reasoningEffort = snapshot.reasoningEffort;
      latest.permissionMode = input.permissionMode;
      writeConversation(userId, latest);
    }
  }

  if (latest.agentSnapshot) {
    input.providerId = latest.agentSnapshot
      .providerId as typeof input.providerId;
    input.modelId = latest.agentSnapshot.modelId;
    input.reasoningEffort = latest.agentSnapshot.reasoningEffort;
  }

  try {
    await submitMessage(userId, input);
    return c.json({ accepted: true }, 202);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to submit message",
      },
      409,
    );
  }
});
