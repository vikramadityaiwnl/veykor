import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { CollabDelivery, CollabDeliveryState, CollabEvent, CollabEventType, CollabMessage, CollabMessageKind, CollabParticipant, CollabSourceKind, CollabTask, CollabTaskState } from "@veykor/shared";
import { db } from "../db/client.js";
import { collabDeliveries, collabEvents, collabMessages, collabParticipants, collabTasks } from "../db/schema.js";

function parseList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function toParticipant(
  row: typeof collabParticipants.$inferSelect,
): CollabParticipant {
  return {
    id: row.id,
    parentConversationId: row.parentConversationId,
    conversationId: row.conversationId,
    agentId: row.agentId,
    agentName: row.agentName,
    role: row.role === "lead" ? "lead" : "delegate",
    status: row.status === "done" ? "done" : "active",
    joinedAt: row.joinedAt,
    lastDeliveredSeq: row.lastDeliveredSeq,
  };
}

function toTask(row: typeof collabTasks.$inferSelect): CollabTask {
  return {
    id: row.id,
    parentConversationId: row.parentConversationId,
    participantId: row.participantId,
    conversationId: row.conversationId,
    agentId: row.agentId,
    agentName: row.agentName,
    title: row.title,
    instructions: row.instructions,
    expectedOutcome: row.expectedOutcome,
    context: row.context,
    state: row.state as CollabTaskState,
    waitingOn: parseList(row.waitingOn),
    blockedBy: row.blockedBy,
    interruptState:
      (row.interruptState as CollabTask["interruptState"]) || "none",
    interruptReason: row.interruptReason,
    result: row.result,
    resultPreview: row.resultPreview,
    resultIncomplete: row.resultIncomplete === 1,
    error: row.error,
    turnId: row.turnId,
    submissionId: row.submissionId,
    reminders: row.reminders,
    createdByConversationId: row.createdByConversationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEvent(row: typeof collabEvents.$inferSelect): CollabEvent {
  return {
    id: row.id,
    parentConversationId: row.parentConversationId,
    seq: row.seq,
    type: row.type as CollabEventType,
    sourceKind: row.sourceKind as CollabSourceKind,
    sourceConversationId: row.sourceConversationId,
    sourceName: row.sourceName,
    participantId: row.participantId,
    participantName: row.participantName,
    taskId: row.taskId,
    correlationId: row.correlationId,
    title: row.title,
    body: row.body,
    taskState: (row.taskState as CollabTaskState | "") || "",
    responseRequired: row.responseRequired === 1,
    createdAt: row.createdAt,
  };
}

export function listParticipants(
  userId: number,
  parentConversationId: string,
): CollabParticipant[] {
  return db
    .select()
    .from(collabParticipants)
    .where(
      and(
        eq(collabParticipants.userId, userId),
        eq(collabParticipants.parentConversationId, parentConversationId),
      ),
    )
    .orderBy(asc(collabParticipants.joinedAt), asc(collabParticipants.id))
    .all()
    .map(toParticipant);
}

export function readParticipant(
  userId: number,
  parentConversationId: string,
  conversationId: string,
): CollabParticipant | undefined {
  const row = db
    .select()
    .from(collabParticipants)
    .where(
      and(
        eq(collabParticipants.userId, userId),
        eq(collabParticipants.parentConversationId, parentConversationId),
        eq(collabParticipants.conversationId, conversationId),
      ),
    )
    .get();

  return row ? toParticipant(row) : undefined;
}

export function participantForAgent(
  userId: number,
  parentConversationId: string,
  agentId: string,
): CollabParticipant | undefined {
  const row = db
    .select()
    .from(collabParticipants)
    .where(
      and(
        eq(collabParticipants.userId, userId),
        eq(collabParticipants.parentConversationId, parentConversationId),
        eq(collabParticipants.agentId, agentId),
      ),
    )
    .get();

  return row ? toParticipant(row) : undefined;
}

export function insertParticipant(input: {
  userId: number;
  parentConversationId: string;
  conversationId: string;
  agentId: string;
  agentName: string;
  role: "lead" | "delegate";
}): CollabParticipant {
  const now = Date.now();

  const row = db
    .insert(collabParticipants)
    .values({
      id: randomUUID(),
      userId: input.userId,
      parentConversationId: input.parentConversationId,
      conversationId: input.conversationId,
      agentId: input.agentId,
      agentName: input.agentName,
      role: input.role,
      status: "active",
      joinedAt: now,
      lastDeliveredSeq: 0,
    })
    .onConflictDoNothing({
      target: [
        collabParticipants.userId,
        collabParticipants.parentConversationId,
        collabParticipants.conversationId,
      ],
    })
    .returning()
    .get();

  if (row) {
    return toParticipant(row);
  }

  return readParticipant(
    input.userId,
    input.parentConversationId,
    input.conversationId,
  )!;
}

export function touchParticipantDelivered(
  userId: number,
  participantId: string,
  seq: number,
) {
  db.update(collabParticipants)
    .set({ lastDeliveredSeq: seq })
    .where(
      and(
        eq(collabParticipants.userId, userId),
        eq(collabParticipants.id, participantId),
        sql`${collabParticipants.lastDeliveredSeq} < ${seq}`,
      ),
    )
    .run();
}

export function listTasks(
  userId: number,
  parentConversationId: string,
): CollabTask[] {
  return db
    .select()
    .from(collabTasks)
    .where(
      and(
        eq(collabTasks.userId, userId),
        eq(collabTasks.parentConversationId, parentConversationId),
      ),
    )
    .orderBy(asc(collabTasks.createdAt), asc(collabTasks.id))
    .all()
    .map(toTask);
}

export function readTask(
  userId: number,
  taskId: string,
): CollabTask | undefined {
  const row = db
    .select()
    .from(collabTasks)
    .where(and(eq(collabTasks.userId, userId), eq(collabTasks.id, taskId)))
    .get();

  return row ? toTask(row) : undefined;
}

export function activeTaskForSession(
  userId: number,
  conversationId: string,
): CollabTask | undefined {
  return db
    .select()
    .from(collabTasks)
    .where(
      and(
        eq(collabTasks.userId, userId),
        eq(collabTasks.conversationId, conversationId),
      ),
    )
    .orderBy(desc(collabTasks.updatedAt))
    .all()
    .map(toTask)
    .find((task) => !terminalTaskStates.has(task.state));
}

export const terminalTaskStates: ReadonlySet<CollabTaskState> = new Set([
  "completed",
  "interrupted",
  "failed",
  "blocked",
]);

export function insertTask(input: {
  userId: number;
  parentConversationId: string;
  participantId: string;
  conversationId: string;
  agentId: string;
  agentName: string;
  title: string;
  instructions: string;
  expectedOutcome: string;
  context: string;
  waitingOn: string[];
  createdByConversationId: string;
}): CollabTask {
  const now = Date.now();

  return toTask(
    db
      .insert(collabTasks)
      .values({
        id: randomUUID(),
        userId: input.userId,
        parentConversationId: input.parentConversationId,
        participantId: input.participantId,
        conversationId: input.conversationId,
        agentId: input.agentId,
        agentName: input.agentName,
        title: input.title,
        instructions: input.instructions,
        expectedOutcome: input.expectedOutcome,
        context: input.context,
        state: "queued",
        waitingOn: JSON.stringify(input.waitingOn),
        blockedBy: "",
        interruptState: "none",
        interruptReason: "",
        result: "",
        resultPreview: "",
        resultIncomplete: 0,
        error: "",
        turnId: "",
        submissionId: "",
        reminders: 0,
        createdByConversationId: input.createdByConversationId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get(),
  );
}

export function updateTask(
  userId: number,
  taskId: string,
  patch: Partial<{
    state: CollabTaskState;
    waitingOn: string[];
    blockedBy: string;
    interruptState: CollabTask["interruptState"];
    interruptReason: string;
    result: string;
    resultPreview: string;
    resultIncomplete: boolean;
    error: string;
    turnId: string;
    submissionId: string;
    reminders: number;
  }>,
): CollabTask | undefined {
  const set: Record<string, unknown> = { updatedAt: Date.now() };

  if (patch.state !== undefined) {
    set.state = patch.state;
  }

  if (patch.waitingOn !== undefined) {
    set.waitingOn = JSON.stringify(patch.waitingOn);
  }

  if (patch.blockedBy !== undefined) {
    set.blockedBy = patch.blockedBy;
  }

  if (patch.interruptState !== undefined) {
    set.interruptState = patch.interruptState;
  }

  if (patch.interruptReason !== undefined) {
    set.interruptReason = patch.interruptReason;
  }

  if (patch.result !== undefined) {
    set.result = patch.result;
  }

  if (patch.resultPreview !== undefined) {
    set.resultPreview = patch.resultPreview;
  }

  if (patch.resultIncomplete !== undefined) {
    set.resultIncomplete = patch.resultIncomplete ? 1 : 0;
  }

  if (patch.error !== undefined) {
    set.error = patch.error;
  }

  if (patch.turnId !== undefined) {
    set.turnId = patch.turnId;
  }

  if (patch.submissionId !== undefined) {
    set.submissionId = patch.submissionId;
  }

  if (patch.reminders !== undefined) {
    set.reminders = patch.reminders;
  }

  const row = db
    .update(collabTasks)
    .set(set)
    .where(and(eq(collabTasks.userId, userId), eq(collabTasks.id, taskId)))
    .returning()
    .get();

  return row ? toTask(row) : undefined;
}

function nextEventSeq(userId: number, parentConversationId: string): number {
  const row = db
    .select({ seq: sql<number>`coalesce(max(${collabEvents.seq}), 0)` })
    .from(collabEvents)
    .where(
      and(
        eq(collabEvents.userId, userId),
        eq(collabEvents.parentConversationId, parentConversationId),
      ),
    )
    .get();

  return (row?.seq || 0) + 1;
}

export function insertEvent(input: {
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
}): CollabEvent {
  const id = randomUUID();
  const now = Date.now();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return toEvent(
        db
          .insert(collabEvents)
          .values({
            id,
            userId: input.userId,
            parentConversationId: input.parentConversationId,
            seq: nextEventSeq(input.userId, input.parentConversationId),
            type: input.type,
            sourceKind: input.sourceKind,
            sourceConversationId: input.sourceConversationId,
            sourceName: input.sourceName,
            participantId: input.participantId || "",
            participantName: input.participantName || "",
            taskId: input.taskId || "",
            correlationId: input.correlationId || id,
            title: input.title,
            body: input.body,
            taskState: input.taskState || "",
            responseRequired: input.responseRequired ? 1 : 0,
            createdAt: now,
          })
          .onConflictDoNothing({
            target: [
              collabEvents.userId,
              collabEvents.parentConversationId,
              collabEvents.correlationId,
              collabEvents.type,
            ],
          })
          .returning()
          .get() ||
          existingEvent(
            input.userId,
            input.parentConversationId,
            input.correlationId || id,
            input.type,
          )!,
      );
    } catch {
      continue;
    }
  }

  throw new Error("Unable to record collaboration event");
}

function existingEvent(
  userId: number,
  parentConversationId: string,
  correlationId: string,
  type: CollabEventType,
) {
  return db
    .select()
    .from(collabEvents)
    .where(
      and(
        eq(collabEvents.userId, userId),
        eq(collabEvents.parentConversationId, parentConversationId),
        eq(collabEvents.correlationId, correlationId),
        eq(collabEvents.type, type),
      ),
    )
    .get();
}

export function listEvents(
  userId: number,
  parentConversationId: string,
): CollabEvent[] {
  return db
    .select()
    .from(collabEvents)
    .where(
      and(
        eq(collabEvents.userId, userId),
        eq(collabEvents.parentConversationId, parentConversationId),
      ),
    )
    .orderBy(asc(collabEvents.seq))
    .all()
    .map(toEvent);
}

export function eventsSince(
  userId: number,
  parentConversationId: string,
  seq: number,
): CollabEvent[] {
  return listEvents(userId, parentConversationId).filter(
    (event) => event.seq > seq,
  );
}

export function queueDelivery(
  userId: number,
  parentConversationId: string,
  eventId: string,
  conversationId: string,
) {
  db.insert(collabDeliveries)
    .values({
      id: randomUUID(),
      userId,
      eventId,
      parentConversationId,
      conversationId,
      state: "queued",
      updatedAt: Date.now(),
    })
    .onConflictDoNothing({
      target: [
        collabDeliveries.userId,
        collabDeliveries.eventId,
        collabDeliveries.conversationId,
      ],
    })
    .run();
}

export function markDelivered(
  userId: number,
  eventId: string,
  conversationId: string,
  state: CollabDeliveryState = "delivered",
) {
  db.update(collabDeliveries)
    .set({ state, updatedAt: Date.now() })
    .where(
      and(
        eq(collabDeliveries.userId, userId),
        eq(collabDeliveries.eventId, eventId),
        eq(collabDeliveries.conversationId, conversationId),
      ),
    )
    .run();
}

export function queuedDeliveries(
  userId: number,
  conversationId: string,
): { deliveryId: string; event: CollabEvent }[] {
  const rows = db
    .select({
      deliveryId: collabDeliveries.id,
      event: collabEvents,
    })
    .from(collabDeliveries)
    .innerJoin(collabEvents, eq(collabDeliveries.eventId, collabEvents.id))
    .where(
      and(
        eq(collabDeliveries.userId, userId),
        eq(collabDeliveries.conversationId, conversationId),
        eq(collabDeliveries.state, "queued"),
      ),
    )
    .orderBy(asc(collabEvents.seq))
    .all();

  return rows.map((row) => ({
    deliveryId: row.deliveryId,
    event: toEvent(row.event),
  }));
}

export function pendingDeliveryCount(
  userId: number,
  conversationId: string,
): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(collabDeliveries)
    .where(
      and(
        eq(collabDeliveries.userId, userId),
        eq(collabDeliveries.conversationId, conversationId),
        eq(collabDeliveries.state, "queued"),
      ),
    )
    .get();

  return row?.count || 0;
}

export function listDeliveries(
  userId: number,
  parentConversationId: string,
  nameFor: (conversationId: string) => string,
): CollabDelivery[] {
  const rows = db
    .select({
      delivery: collabDeliveries,
      event: collabEvents,
    })
    .from(collabDeliveries)
    .innerJoin(collabEvents, eq(collabDeliveries.eventId, collabEvents.id))
    .where(
      and(
        eq(collabDeliveries.userId, userId),
        eq(collabDeliveries.parentConversationId, parentConversationId),
      ),
    )
    .orderBy(asc(collabEvents.seq))
    .all();

  return rows.map((row) => ({
    eventId: row.delivery.eventId,
    eventSeq: row.event.seq,
    conversationId: row.delivery.conversationId,
    participantName: nameFor(row.delivery.conversationId),
    state: row.delivery.state as CollabDeliveryState,
    updatedAt: row.delivery.updatedAt,
  }));
}

export function insertMessage(input: {
  userId: number;
  parentConversationId: string;
  fromConversationId: string;
  fromName: string;
  toConversationId: string;
  toName: string;
  taskId?: string;
  kind: CollabMessageKind;
  text: string;
  correlationId?: string;
}): CollabMessage {
  const now = Date.now();

  const row = db
    .insert(collabMessages)
    .values({
      id: randomUUID(),
      userId: input.userId,
      parentConversationId: input.parentConversationId,
      fromConversationId: input.fromConversationId,
      fromName: input.fromName,
      toConversationId: input.toConversationId,
      toName: input.toName,
      taskId: input.taskId || "",
      kind: input.kind,
      text: input.text,
      correlationId: input.correlationId || randomUUID(),
      createdAt: now,
    })
    .returning()
    .get();

  return {
    id: row.id,
    parentConversationId: row.parentConversationId,
    fromConversationId: row.fromConversationId,
    fromName: row.fromName,
    toConversationId: row.toConversationId,
    toName: row.toName,
    taskId: row.taskId,
    kind: row.kind as CollabMessageKind,
    text: row.text,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  };
}

export function deleteCollaboration(
  userId: number,
  parentConversationId: string,
) {
  db.delete(collabDeliveries)
    .where(
      and(
        eq(collabDeliveries.userId, userId),
        eq(collabDeliveries.parentConversationId, parentConversationId),
      ),
    )
    .run();

  db.delete(collabMessages)
    .where(
      and(
        eq(collabMessages.userId, userId),
        eq(collabMessages.parentConversationId, parentConversationId),
      ),
    )
    .run();

  db.delete(collabEvents)
    .where(
      and(
        eq(collabEvents.userId, userId),
        eq(collabEvents.parentConversationId, parentConversationId),
      ),
    )
    .run();

  db.delete(collabTasks)
    .where(
      and(
        eq(collabTasks.userId, userId),
        eq(collabTasks.parentConversationId, parentConversationId),
      ),
    )
    .run();

  db.delete(collabParticipants)
    .where(
      and(
        eq(collabParticipants.userId, userId),
        eq(collabParticipants.parentConversationId, parentConversationId),
      ),
    )
    .run();
}
