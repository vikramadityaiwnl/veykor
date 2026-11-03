import { and, asc, eq, ne } from "drizzle-orm";
import type { ChatRequest, ChatSession, QueuedChatMessage } from "@veykor/shared";
import { db } from "../db/client.js";
import { chatInputs, conversations, users } from "../db/schema.js";
import { commandId } from "../providers/command-id.js";
import { chatProviderFor } from "../providers/index.js";
import { parseChatDefaults } from "../settings/chat-defaults.js";
import { readConversation, validConversationLocation, writeConversation } from "./conversations.js";
import { attachCollabDigest, confirmCollabDigest } from "./collab-dispatch.js";
import { onQueueRowError, onTurnSettled } from "../collab/turn-hooks.js";

type InputRow = typeof chatInputs.$inferSelect;

const steering = new Set<string>();
const workers = new Map<string, Promise<void>>();
let closing = false;
let timer: NodeJS.Timeout | undefined;

function entries(userId: number, conversationId: string): InputRow[] {
  return db
    .select()
    .from(chatInputs)
    .where(
      and(
        eq(chatInputs.userId, userId),
        eq(chatInputs.conversationId, conversationId),
        ne(chatInputs.state, "sent"),
      ),
    )
    .orderBy(asc(chatInputs.position), asc(chatInputs.createdAt))
    .all();
}

export function queuedMessages(
  userId: number,
  conversationId: string,
): QueuedChatMessage[] {
  return entries(userId, conversationId)
    .filter((row) => row.state !== "sending")
    .map((row) => {
      const request = JSON.parse(row.payload) as ChatRequest;
      const message = request.messages.at(-1)!;

      return {
        id: row.id,
        clientMessageId: row.clientMessageId,
        text: message.text,
        attachmentCount: message.attachments?.length || 0,
        createdAt: row.createdAt,
        state: row.state === "error" ? "error" : "queued",
        error: row.error,
        errorKind:
          row.state === "error"
            ? row.errorKind === "rejected"
              ? "rejected"
              : "uncertain"
            : "",
      };
    });
}

export function withQueue(userId: number, session: ChatSession): ChatSession {
  const metadata = readConversation(userId, session.id);

  return {
    ...session,
    queuedMessages: queuedMessages(userId, session.id),
    queuePaused: metadata?.queuePaused || false,
  };
}

export function pauseQueue(
  userId: number,
  conversationId: string,
  paused: boolean,
) {
  db.update(conversations)
    .set({ queuePaused: paused ? 1 : 0 })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    )
    .run();
}

function markSent(row: InputRow) {
  db.update(chatInputs)
    .set({ state: "sent", payload: "{}", error: "", errorKind: "" })
    .where(eq(chatInputs.id, row.id))
    .run();
}

export function queueErrorKind(error: unknown): "rejected" | "uncertain" {
  const message = error instanceof Error ? error.message : "";

  if (
    /conversation not found|project not found|invalid image|no enabled|model must use|not supported/i.test(
      message,
    )
  ) {
    return "rejected";
  }

  return "uncertain";
}

function markError(
  row: InputRow,
  error: unknown,
  kind: "rejected" | "uncertain" = queueErrorKind(error),
) {
  db.update(chatInputs)
    .set({
      state: "error",
      error:
        error instanceof Error ? error.message : "Unable to send this message",
      errorKind: kind,
    })
    .where(eq(chatInputs.id, row.id))
    .run();
  pauseQueue(row.userId, row.conversationId, true);
  onQueueRowError(row.id);
}

async function drain(userId: number, conversationId: string) {
  while (!closing) {
    const metadata = readConversation(userId, conversationId);
    const row = entries(userId, conversationId)[0];

    if (!metadata || !row || !validConversationLocation(userId, metadata)) {
      return;
    }

    const provider = chatProviderFor(metadata.providerId);

    if (!provider || provider.isBusy(userId, conversationId)) {
      return;
    }

    if (row.state === "sending") {
      if (steering.has(row.id)) {
        return;
      }

      try {
        const snapshot = await provider.open(userId, conversationId);

        if (
          snapshot?.messages.some((message) => message.submissionId === row.id)
        ) {
          markSent(row);
          continue;
        }

        markError(
          row,
          new Error(
            "Delivery is uncertain after an interruption. The message may already have been accepted, so it was not resent. Check the conversation, then use Retry to send it or delete it.",
          ),
          "uncertain",
        );
      } catch (error) {
        markError(row, error);
      }

      return;
    }

    if (metadata.queuePaused || row.state === "error") {
      return;
    }

    const claimed = db
      .update(chatInputs)
      .set({ state: "sending" })
      .where(and(eq(chatInputs.id, row.id), eq(chatInputs.state, "queued")))
      .run();

    if (!claimed.changes) {
      continue;
    }

    try {
      const input = JSON.parse(row.payload) as ChatRequest;
      const collab = attachCollabDigest(userId, input);
      await provider.runTurn(userId, { ...collab.input, messageId: row.id });
      const snapshot = await provider.describe(userId, conversationId);

      if (
        snapshot?.messages.some((message) => message.submissionId === row.id)
      ) {
        markSent(row);
        confirmCollabDigest(userId, collab, conversationId);
        await onTurnSettled(userId, conversationId, row).catch((error) => {
          console.error("Collaboration follow-up failed", error);
        });
        if (snapshot.error) {
          pauseQueue(userId, conversationId, true);
          return;
        }
      } else {
        markError(
          row,
          new Error(
            snapshot?.error ||
              "Delivery is uncertain. The provider did not confirm this message, so it was not resent. Check the conversation, then use Retry to send it or delete it.",
          ),
          "uncertain",
        );
        return;
      }
    } catch (error) {
      markError(row, error);
      return;
    }
  }
}

export function dispatchQueue(userId: number, conversationId: string): void {
  const key = `${userId}:${conversationId}`;

  if (closing || workers.has(key)) {
    return;
  }

  const promise = drain(userId, conversationId)
    .catch((error) => {
      console.error("Message queue failed", error);
    })
    .finally(() => {
      workers.delete(key);
    });
  workers.set(key, promise);
}

export async function submitMessage(userId: number, input: ChatRequest) {
  const existing = db
    .select()
    .from(chatInputs)
    .where(
      and(
        eq(chatInputs.userId, userId),
        eq(chatInputs.conversationId, input.conversationId),
        eq(chatInputs.clientMessageId, input.messageId),
      ),
    )
    .get();

  if (existing) {
    return;
  }

  const pending = entries(userId, input.conversationId);

  if (pending.length >= 100) {
    throw new Error("This chat already has 100 pending messages");
  }

  const id = commandId();
  const now = Date.now();
  const row = db
    .insert(chatInputs)
    .values({
      id,
      userId,
      conversationId: input.conversationId,
      clientMessageId: input.messageId,
      payload: JSON.stringify(input),
      state: "queued",
      position: Math.max(now, ...pending.map((entry) => entry.position + 1)),
      createdAt: now,
    })
    .returning()
    .get();
  const preference = db
    .select({ chatDefaults: users.chatDefaults })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  const delivery =
    input.delivery ||
    parseChatDefaults(preference?.chatDefaults).messageBehavior;
  const provider = chatProviderFor(input.providerId)!;
  const conversation = readConversation(userId, input.conversationId);

  if (conversation) {
    writeConversation(userId, {
      ...conversation,
      providerId: input.providerId,
      modelId: input.modelId,
      reasoningEffort: input.reasoningEffort,
      permissionMode: input.permissionMode,
      recoveryError: "",
    });
  }

  pauseQueue(userId, input.conversationId, false);

  if (delivery === "steer" && provider.isBusy(userId, input.conversationId)) {
    try {
      await steerRow(row);
    } catch {
      return;
    }
  } else {
    dispatchQueue(userId, input.conversationId);
  }
}

function editableRow(
  userId: number,
  conversationId: string,
  id: string,
): InputRow {
  const row = entries(userId, conversationId).find((entry) => entry.id === id);

  if (!row || row.state === "sending") {
    throw new Error("This message has already started or is no longer queued");
  }

  return row;
}

export function editQueuedMessage(
  userId: number,
  conversationId: string,
  id: string,
  text: string,
) {
  const row = editableRow(userId, conversationId, id);
  const input = JSON.parse(row.payload) as ChatRequest;
  input.messages[input.messages.length - 1].text = text;
  db.update(chatInputs)
    .set({
      payload: JSON.stringify(input),
      state: "queued",
      error: "",
      errorKind: "",
    })
    .where(and(eq(chatInputs.id, row.id), ne(chatInputs.state, "sending")))
    .run();
}

export function deleteQueuedMessage(
  userId: number,
  conversationId: string,
  id: string,
) {
  const row = editableRow(userId, conversationId, id);
  db.delete(chatInputs)
    .where(and(eq(chatInputs.id, row.id), ne(chatInputs.state, "sending")))
    .run();
}

async function steerRow(row: InputRow) {
  const provider = chatProviderFor(JSON.parse(row.payload).providerId)!;

  if (!provider.isBusy(row.userId, row.conversationId)) {
    const first = entries(row.userId, row.conversationId)[0];
    db.update(chatInputs)
      .set({
        state: "queued",
        error: "",
        errorKind: "",
        position: (first?.position || Date.now()) - 1,
      })
      .where(eq(chatInputs.id, row.id))
      .run();
    pauseQueue(row.userId, row.conversationId, false);
    dispatchQueue(row.userId, row.conversationId);
    return;
  }

  steering.add(row.id);
  db.update(chatInputs)
    .set({ state: "sending", error: "", errorKind: "" })
    .where(eq(chatInputs.id, row.id))
    .run();

  try {
    const input = JSON.parse(row.payload) as ChatRequest;
    await provider.steer(row.userId, { ...input, messageId: row.id });
    markSent(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (
      /no active turn|not running|expected.*turn|turn.*(completed|mismatch)/i.test(
        message,
      )
    ) {
      const first = entries(row.userId, row.conversationId)[0];
      db.update(chatInputs)
        .set({
          state: "queued",
          error: "",
          errorKind: "",
          position: (first?.position || Date.now()) - 1,
        })
        .where(eq(chatInputs.id, row.id))
        .run();
    } else {
      markError(row, error);
      throw error;
    }
  } finally {
    steering.delete(row.id);
    dispatchQueue(row.userId, row.conversationId);
  }
}

export function hasSubmittedMessages(
  userId: number,
  conversationId: string,
): boolean {
  return !!db
    .select({ id: chatInputs.id })
    .from(chatInputs)
    .where(
      and(
        eq(chatInputs.userId, userId),
        eq(chatInputs.conversationId, conversationId),
      ),
    )
    .get();
}

export async function steerQueuedMessage(
  userId: number,
  conversationId: string,
  id: string,
) {
  await steerRow(editableRow(userId, conversationId, id));
}

export function startMessageQueue() {
  clearInterval(timer);
  closing = false;
  timer = setInterval(() => {
    const waiting = db
      .select({
        userId: chatInputs.userId,
        conversationId: chatInputs.conversationId,
      })
      .from(chatInputs)
      .where(ne(chatInputs.state, "sent"))
      .all();

    for (const row of waiting) {
      dispatchQueue(row.userId, row.conversationId);
    }
  }, 250);
  timer.unref();
}

export function stopMessageQueue() {
  closing = true;
  clearInterval(timer);
}
