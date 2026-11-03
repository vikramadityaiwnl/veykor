import type { CollabEvent, CollabEventType, CollabSourceKind, CollabTaskState } from "@veykor/shared";
import { eventsSince, insertEvent, listEvents, listParticipants, markDelivered, pendingDeliveryCount, queueDelivery, queuedDeliveries, readParticipant, touchParticipantDelivered } from "./store.js";
import { maxEventsPerChat } from "./limits.js";

export interface PublishInput {
  userId: number;
  parentConversationId: string;
  type: CollabEventType;
  sourceKind: CollabSourceKind;
  sourceConversationId: string;
  sourceName: string;
  participantId?: string;
  participantName?: string;
  taskId?: string;
  correlationId?: string;
  title: string;
  body: string;
  taskState?: CollabTaskState | "";
  responseRequired?: boolean;
  includeSource?: boolean;
  skipConversationIds?: string[];
}

const leadWakeTypes: ReadonlySet<CollabEventType> = new Set([
  "result-reported",
  "interruption-confirmed",
  "interruption-failed",
  "task-failed",
  "clarification-requested",
  "clarification-answered",
]);

const delegateWakeTypes: ReadonlySet<CollabEventType> = new Set([
  "clarification-requested",
  "clarification-answered",
  "message",
]);

export function shouldWakeRecipient(
  userId: number,
  parentConversationId: string,
  event: CollabEvent,
  recipientConversationId: string,
): boolean {
  if (!event.responseRequired) {
    return false;
  }

  if (
    event.sourceKind !== "system" &&
    event.sourceConversationId === recipientConversationId
  ) {
    return false;
  }

  if (recipientConversationId === parentConversationId) {
    if (!leadWakeTypes.has(event.type)) {
      return false;
    }

    if (event.type === "clarification-requested" && event.participantId) {
      const lead = readParticipant(
        userId,
        parentConversationId,
        parentConversationId,
      );

      return !lead || event.participantId === lead.id;
    }

    return true;
  }

  if (!delegateWakeTypes.has(event.type)) {
    return false;
  }

  const recipient = readParticipant(
    userId,
    parentConversationId,
    recipientConversationId,
  );

  return !!recipient && event.participantId === recipient.id;
}

export function publishEvent(input: PublishInput): CollabEvent {
  if (
    listEvents(input.userId, input.parentConversationId).length >=
    maxEventsPerChat
  ) {
    throw new Error("This chat reached its collaboration event limit");
  }

  const event = insertEvent({
    userId: input.userId,
    parentConversationId: input.parentConversationId,
    type: input.type,
    sourceKind: input.sourceKind,
    sourceConversationId: input.sourceConversationId,
    sourceName: input.sourceName,
    participantId: input.participantId || "",
    participantName: input.participantName || "",
    taskId: input.taskId || "",
    correlationId: input.correlationId,
    title: input.title,
    body: input.body,
    taskState: input.taskState || "",
    responseRequired: input.responseRequired || false,
  });

  const skip = new Set(input.skipConversationIds || []);

  if (!input.includeSource) {
    skip.add(input.sourceConversationId);
  }

  for (const participant of listParticipants(
    input.userId,
    input.parentConversationId,
  )) {
    if (skip.has(participant.conversationId)) {
      continue;
    }

    queueDelivery(
      input.userId,
      input.parentConversationId,
      event.id,
      participant.conversationId,
    );
  }

  return event;
}

export function pendingEvents(
  userId: number,
  conversationId: string,
): CollabEvent[] {
  return queuedDeliveries(userId, conversationId).map((entry) => entry.event);
}

export function pendingCount(userId: number, conversationId: string): number {
  return pendingDeliveryCount(userId, conversationId);
}

function truncate(text: string, length: number): string {
  const clean = text.replace(/\s+/g, " ").trim();

  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}

export function digestLine(event: CollabEvent): string {
  const who = event.participantName || event.sourceName || "collaboration";
  const detail = event.body ? `: ${truncate(event.body, 300)}` : "";

  return `- [${event.type}] ${who} — ${truncate(event.title, 160)}${detail}`;
}

export function buildDigest(
  userId: number,
  parentConversationId: string,
  conversationId: string,
): { text: string; eventIds: string[]; maxSeq: number } {
  const pending = pendingEvents(userId, conversationId);

  if (pending.length === 0) {
    return { text: "", eventIds: [], maxSeq: 0 };
  }

  const windowed = pending.slice(0, 30);
  const skipped = pending.length - windowed.length;
  const lines = windowed.map((event) => {
    const wake = shouldWakeRecipient(
      userId,
      parentConversationId,
      event,
      conversationId,
    );

    return `${digestLine(event)}${wake ? " [action needed]" : ""}`;
  });

  if (skipped > 0) {
    lines.push(
      `- ${skipped} newer update(s) will follow; use veykor_read_events for full history.`,
    );
  }

  const text = [
    `[veykor collaboration update — ${pending.length} pending]`,
    ...lines,
    "[End of update. Act only on items marked action needed or needed for coordination; otherwise continue your current work without acknowledging each item.]",
  ].join("\n");

  return {
    text,
    eventIds: windowed.map((event) => event.id),
    maxSeq: Math.max(...windowed.map((event) => event.seq)),
  };
}

export function consumeDeliveries(
  userId: number,
  parentConversationId: string,
  conversationId: string,
  eventIds: string[],
  maxSeq: number,
  state: "delivered" | "acked" = "delivered",
) {
  for (const eventId of eventIds) {
    markDelivered(userId, eventId, conversationId, state);
  }

  if (maxSeq > 0) {
    const participant = readParticipant(
      userId,
      parentConversationId,
      conversationId,
    );

    if (participant) {
      touchParticipantDelivered(userId, participant.id, maxSeq);
    }
  }
}

export function unreadSince(
  userId: number,
  parentConversationId: string,
  seq: number,
): CollabEvent[] {
  return eventsSince(userId, parentConversationId, seq);
}

export function markReadThrough(
  userId: number,
  parentConversationId: string,
  conversationId: string,
  throughSeq: number,
) {
  for (const event of eventsSince(userId, parentConversationId, 0)) {
    if (event.seq <= throughSeq) {
      markDelivered(userId, event.id, conversationId, "acked");
    }
  }

  const participant = readParticipant(
    userId,
    parentConversationId,
    conversationId,
  );

  if (participant) {
    touchParticipantDelivered(userId, participant.id, throughSeq);
  }
}
