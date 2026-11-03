import { and, asc, eq, like, ne } from "drizzle-orm";
import type { ChatRequest } from "@veykor/shared";
import { db } from "../db/client.js";
import { chatInputs } from "../db/schema.js";
import { commandId } from "../providers/command-id.js";
import { readConversation } from "./conversations.js";
import { buildDigest, consumeDeliveries } from "../collab/events.js";

export interface CollabDispatchContext {
  input: ChatRequest;
  parentConversationId: string;
  eventIds: string[];
  maxSeq: number;
}

export function attachCollabDigest(
  userId: number,
  input: ChatRequest,
): CollabDispatchContext {
  const metadata = readConversation(userId, input.conversationId);
  const parentConversationId =
    metadata?.parentConversationId || input.conversationId;

  const digest = buildDigest(
    userId,
    parentConversationId,
    input.conversationId,
  );

  if (!digest.text) {
    return {
      input,
      parentConversationId,
      eventIds: [],
      maxSeq: 0,
    };
  }

  const messages = [...input.messages];
  const last = messages[messages.length - 1];

  messages[messages.length - 1] = {
    ...last,
    text: `${digest.text}\n\n${last.text}`,
  };

  return {
    input: { ...input, messages },
    parentConversationId,
    eventIds: digest.eventIds,
    maxSeq: digest.maxSeq,
  };
}

export function confirmCollabDigest(
  userId: number,
  context: CollabDispatchContext,
  conversationId: string,
) {
  if (context.eventIds.length === 0) {
    return;
  }

  consumeDeliveries(
    userId,
    context.parentConversationId,
    conversationId,
    context.eventIds,
    context.maxSeq,
    "delivered",
  );
}

export function hasPendingCollabRows(
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
        like(chatInputs.clientMessageId, "collab-%"),
        ne(chatInputs.state, "sent"),
      ),
    )
    .get();
}

export function enqueueCollabTurn(input: {
  userId: number;
  conversationId: string;
  clientMessageId: string;
  text: string;
}): boolean {
  const existing = db
    .select()
    .from(chatInputs)
    .where(
      and(
        eq(chatInputs.userId, input.userId),
        eq(chatInputs.conversationId, input.conversationId),
        eq(chatInputs.clientMessageId, input.clientMessageId),
      ),
    )
    .get();

  if (existing) {
    if (existing.state !== "error") {
      return false;
    }

    db.delete(chatInputs).where(eq(chatInputs.id, existing.id)).run();
  }

  const metadata = readConversation(input.userId, input.conversationId);

  if (!metadata) {
    return false;
  }

  if (hasPendingCollabRows(input.userId, input.conversationId)) {
    return false;
  }

  const pending = db
    .select()
    .from(chatInputs)
    .where(
      and(
        eq(chatInputs.userId, input.userId),
        eq(chatInputs.conversationId, input.conversationId),
        ne(chatInputs.state, "sent"),
      ),
    )
    .orderBy(asc(chatInputs.position))
    .all();

  if (pending.length >= 100) {
    return false;
  }

  const text = input.text.trim();

  if (!text) {
    return false;
  }

  const request: ChatRequest = {
    conversationId: input.conversationId,
    messageId: input.clientMessageId,
    providerId: metadata.providerId as ChatRequest["providerId"],
    modelId: metadata.modelId,
    permissionMode: metadata.permissionMode,
    reasoningEffort: metadata.reasoningEffort || "max",
    systemPrompt: "",
    messages: [{ role: "user", text: text.slice(0, 100_000) }],
  };

  const now = Date.now();

  db.insert(chatInputs)
    .values({
      id: commandId(),
      userId: input.userId,
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      payload: JSON.stringify(request),
      state: "queued",
      position: Math.max(now, ...pending.map((entry) => entry.position + 1)),
      createdAt: now,
    })
    .run();

  return true;
}

export function cancelCollabRows(userId: number, conversationId: string) {
  db.delete(chatInputs)
    .where(
      and(
        eq(chatInputs.userId, userId),
        eq(chatInputs.conversationId, conversationId),
        like(chatInputs.clientMessageId, "collab-%"),
        ne(chatInputs.state, "sent"),
        ne(chatInputs.state, "sending"),
      ),
    )
    .run();
}
