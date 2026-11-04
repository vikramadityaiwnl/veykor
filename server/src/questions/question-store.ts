import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  questionLimits,
  validateAnswerSubmission,
  validateQuestionPayload,
} from "@veykor/shared";
import type {
  AgentDefinition,
  ClarifyQuestion,
  QuestionAnswer,
  QuestionListResponse,
  QuestionRequest,
  QuestionRequestStatus,
} from "@veykor/shared";
import { db } from "../db/client.js";
import { chats, questionRequests } from "../db/schema.js";
import type { TeamChat } from "../teams/team-runtime.js";

export type QuestionRow = typeof questionRequests.$inferSelect;

export class QuestionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface QuestionSettlement {
  status: QuestionRequestStatus;
  answers: Array<QuestionAnswer>;
  notice: string;
  reason: string;
}

interface Waiter {
  promise: Promise<QuestionSettlement>;
  resolve: (settlement: QuestionSettlement) => void;
}

const waiters = new Map<string, Waiter>();

const inFlightCalls = new Map<string, string>();

function nowIso(): string {
  return new Date().toISOString();
}

function parseQuestions(value: string): Array<ClarifyQuestion> {
  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed) ? (parsed as Array<ClarifyQuestion>) : [];
  } catch {
    return [];
  }
}

function parseAnswers(value: string): Array<QuestionAnswer> {
  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed) ? (parsed as Array<QuestionAnswer>) : [];
  } catch {
    return [];
  }
}

function parseStatus(value: string): QuestionRequestStatus {
  if (
    value === "answered" ||
    value === "cancelled" ||
    value === "orphaned" ||
    value === "pending"
  ) {
    return value;
  }

  return "pending";
}

export function toQuestionRequest(row: QuestionRow): QuestionRequest {
  return {
    id: row.id,
    rootId: row.rootId,
    memberId: row.memberId,
    agentId: row.agentId,
    agentName: row.agentName,
    isMain: row.memberId === row.rootId,
    status: parseStatus(row.status),
    questions: parseQuestions(row.payload),
    answers: parseAnswers(row.answers),
    notice: row.notice,
    reason: row.reason,
    createdAt: row.createdAt,
    settledAt: row.settledAt,
  };
}

function resolveWaiter(
  requestId: string,
  settlement: QuestionSettlement,
): void {
  const waiter = waiters.get(requestId);

  if (waiter) {
    waiters.delete(requestId);
    waiter.resolve(settlement);
  }
}

function waiterFor(requestId: string): Promise<QuestionSettlement> {
  const existing = waiters.get(requestId);

  if (existing) {
    return existing.promise;
  }

  let resolve: (settlement: QuestionSettlement) => void = () => {};

  const promise = new Promise<QuestionSettlement>((accept) => {
    resolve = accept;
  });

  waiters.set(requestId, { promise, resolve });

  return promise;
}

function readRequest(requestId: string): QuestionRow | undefined {
  return db
    .select()
    .from(questionRequests)
    .where(eq(questionRequests.id, requestId))
    .get();
}

function pendingCount(rootId: string): number {
  const found = db
    .select({ value: sql<number>`count(*)` })
    .from(questionRequests)
    .where(
      and(
        eq(questionRequests.rootId, rootId),
        eq(questionRequests.status, "pending"),
      ),
    )
    .get();

  return found?.value ?? 0;
}

export function pendingQuestionCount(memberId: string): number {
  const found = db
    .select({ value: sql<number>`count(*)` })
    .from(questionRequests)
    .where(
      and(
        eq(questionRequests.memberId, memberId),
        eq(questionRequests.status, "pending"),
      ),
    )
    .get();

  return found?.value ?? 0;
}

export function createQuestionRequest(
  row: TeamChat,
  payload: unknown,
  jsonRpcId: string,
): { record: QuestionRequest; duplicate: boolean } {
  const callKey = `${row.id}:${jsonRpcId}`;
  const inFlight = inFlightCalls.get(callKey);

  if (inFlight) {
    const stored = readRequest(inFlight);

    if (stored && stored.status === "pending") {
      return { record: toQuestionRequest(stored), duplicate: true };
    }

    inFlightCalls.delete(callKey);
  }

  const validated = validateQuestionPayload(payload);

  if (validated.error !== "") {
    throw new QuestionError(400, validated.error);
  }

  const rootId = row.parentChatId || row.id;

  if (pendingCount(rootId) >= questionLimits.maxPendingPerChat) {
    throw new QuestionError(
      400,
      "Too many unanswered questions in this chat. Wait for the user to answer before asking more.",
    );
  }

  const agent = JSON.parse(row.agentSnapshot) as Partial<AgentDefinition>;
  const id = randomUUID();
  const stamp = nowIso();

  db.insert(questionRequests)
    .values({
      id,
      userId: row.userId,
      rootId,
      memberId: row.id,
      agentId: agent.id ?? "",
      agentName: agent.name ?? "",
      museSessionId: row.museSessionId,
      turnId: "",
      callKey,
      status: "pending",
      payload: JSON.stringify(validated.questions),
      answers: "[]",
      notice: validated.notice,
      reason: "",
      createdAt: stamp,
      settledAt: "",
    })
    .run();

  inFlightCalls.set(callKey, id);

  const stored = readRequest(id);

  if (!stored) {
    throw new QuestionError(500, "Unable to ask this question right now.");
  }

  return { record: toQuestionRequest(stored), duplicate: false };
}

function settleRow(
  requestId: string,
  status: QuestionRequestStatus,
  answers: Array<QuestionAnswer>,
  reason: string,
): QuestionRow | undefined {
  const stamp = nowIso();

  const updated = db
    .update(questionRequests)
    .set({
      status,
      answers: JSON.stringify(answers),
      reason,
      settledAt: stamp,
    })
    .where(
      and(
        eq(questionRequests.id, requestId),
        eq(questionRequests.status, "pending"),
      ),
    )
    .returning()
    .get();

  return updated;
}

export function waitForSettlement(
  requestId: string,
  signal?: AbortSignal,
): Promise<QuestionSettlement> {
  const stored = readRequest(requestId);

  if (!stored) {
    return Promise.resolve({
      status: "orphaned",
      answers: [],
      notice: "",
      reason: "This question is no longer available.",
    });
  }

  if (stored.status !== "pending") {
    return Promise.resolve({
      status: parseStatus(stored.status),
      answers: parseAnswers(stored.answers),
      notice: stored.notice,
      reason: stored.reason,
    });
  }

  const promise = waiterFor(requestId);

  if (signal) {
    if (signal.aborted) {
      orphanRequest(requestId, "The agent connection closed.");
    } else {
      signal.addEventListener(
        "abort",
        () => {
          orphanRequest(requestId, "The agent connection closed.");
        },
        { once: true },
      );
    }
  }

  return promise;
}

export function orphanRequest(requestId: string, reason: string): void {
  const settled = settleRow(requestId, "orphaned", [], reason);

  if (settled) {
    inFlightCalls.delete(settled.callKey);
    resolveWaiter(requestId, {
      status: "orphaned",
      answers: [],
      notice: settled.notice,
      reason,
    });
  }
}

export function listQuestions(
  userId: number,
  rootId: string,
  memberId = "",
): QuestionListResponse {
  const pending = db
    .select()
    .from(questionRequests)
    .where(
      and(
        eq(questionRequests.userId, userId),
        eq(questionRequests.rootId, rootId),
        eq(questionRequests.status, "pending"),
        ...(memberId === "" ? [] : [eq(questionRequests.memberId, memberId)]),
      ),
    )
    .orderBy(asc(questionRequests.createdAt), asc(sql`question_requests.rowid`))
    .all();

  const settled = db
    .select()
    .from(questionRequests)
    .where(
      and(
        eq(questionRequests.userId, userId),
        eq(questionRequests.rootId, rootId),
        ...(memberId === "" ? [] : [eq(questionRequests.memberId, memberId)]),
      ),
    )
    .orderBy(
      desc(questionRequests.settledAt),
      desc(sql`question_requests.rowid`),
    )
    .all()
    .filter((row) => row.status !== "pending")
    .slice(0, questionLimits.maxSettledReturned);

  return {
    pending: pending.map(toQuestionRequest),
    settled: settled.map(toQuestionRequest),
  };
}

function ownedPendingRequest(
  userId: number,
  rootId: string,
  requestId: string,
): QuestionRow {
  const stored = readRequest(requestId);

  if (!stored || stored.userId !== userId || stored.rootId !== rootId) {
    throw new QuestionError(404, "Question not found.");
  }

  const chat = db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, stored.memberId), eq(chats.userId, userId)))
    .get();

  if (!chat) {
    throw new QuestionError(404, "Question not found.");
  }

  return stored;
}

export function answerQuestionRequest(
  userId: number,
  rootId: string,
  requestId: string,
  submission: unknown,
): { record: QuestionRequest; alreadySettled: boolean } {
  const stored = ownedPendingRequest(userId, rootId, requestId);

  if (stored.status !== "pending") {
    return { record: toQuestionRequest(stored), alreadySettled: true };
  }

  const validated = validateAnswerSubmission(
    parseQuestions(stored.payload),
    submission,
  );

  if (validated.error !== "") {
    throw new QuestionError(400, validated.error);
  }

  const settled = settleRow(requestId, "answered", validated.answers, "");

  if (!settled) {
    const current = readRequest(requestId);

    if (!current) {
      throw new QuestionError(404, "Question not found.");
    }

    return { record: toQuestionRequest(current), alreadySettled: true };
  }

  inFlightCalls.delete(settled.callKey);
  resolveWaiter(requestId, {
    status: "answered",
    answers: validated.answers,
    notice: settled.notice,
    reason: "",
  });

  const current = readRequest(requestId);

  return {
    record: toQuestionRequest(current ?? settled),
    alreadySettled: false,
  };
}

export function cancelQuestionRequest(
  userId: number,
  rootId: string,
  requestId: string,
  reason: string,
): { record: QuestionRequest; alreadySettled: boolean } {
  const stored = ownedPendingRequest(userId, rootId, requestId);

  if (stored.status !== "pending") {
    return { record: toQuestionRequest(stored), alreadySettled: true };
  }

  const settled = settleRow(
    requestId,
    "cancelled",
    [],
    reason === "" ? "The user cancelled this question." : reason,
  );

  if (!settled) {
    const current = readRequest(requestId);

    if (!current) {
      throw new QuestionError(404, "Question not found.");
    }

    return { record: toQuestionRequest(current), alreadySettled: true };
  }

  inFlightCalls.delete(settled.callKey);
  resolveWaiter(requestId, {
    status: "cancelled",
    answers: [],
    notice: settled.notice,
    reason: settled.reason,
  });

  const current = readRequest(requestId);

  return {
    record: toQuestionRequest(current ?? settled),
    alreadySettled: false,
  };
}

export function settleMemberQuestions(
  memberId: string,
  status: QuestionRequestStatus,
  reason: string,
): Array<QuestionRequest> {
  const pending = db
    .select()
    .from(questionRequests)
    .where(
      and(
        eq(questionRequests.memberId, memberId),
        eq(questionRequests.status, "pending"),
      ),
    )
    .all();

  const settled: Array<QuestionRequest> = [];

  for (const row of pending) {
    const updated = settleRow(row.id, status, [], reason);

    if (updated) {
      inFlightCalls.delete(updated.callKey);
      resolveWaiter(row.id, {
        status,
        answers: [],
        notice: updated.notice,
        reason,
      });
      settled.push(toQuestionRequest(updated));
    }
  }

  return settled;
}

export function settleRootQuestions(
  rootId: string,
  status: QuestionRequestStatus,
  reason: string,
): void {
  const pending = db
    .select()
    .from(questionRequests)
    .where(
      and(
        eq(questionRequests.rootId, rootId),
        eq(questionRequests.status, "pending"),
      ),
    )
    .all();

  for (const row of pending) {
    const updated = settleRow(row.id, status, [], reason);

    if (updated) {
      inFlightCalls.delete(updated.callKey);
      resolveWaiter(row.id, {
        status,
        answers: [],
        notice: updated.notice,
        reason,
      });
    }
  }
}

export function sweepOrphanedRequests(reason: string): number {
  const pending = db
    .select()
    .from(questionRequests)
    .where(eq(questionRequests.status, "pending"))
    .all();

  for (const row of pending) {
    const updated = settleRow(row.id, "orphaned", [], reason);

    if (updated) {
      inFlightCalls.delete(updated.callKey);
      resolveWaiter(row.id, {
        status: "orphaned",
        answers: [],
        notice: updated.notice,
        reason,
      });
    }
  }

  return pending.length;
}

export function questionAskedText(record: QuestionRequest): string {
  const first = record.questions[0]?.question ?? "";
  const count =
    record.questions.length === 1
      ? "1 question"
      : `${record.questions.length} questions`;

  return `${record.agentName || "The agent"} asked ${count}: ${first.slice(0, 200)}`;
}

export function questionAnsweredText(record: QuestionRequest): string {
  const summary = record.answers
    .map((answer) =>
      answer.kind === "option" ? answer.label : answer.customText,
    )
    .join(" / ");

  return `The user answered ${record.agentName || "the agent"}'s question: ${summary.slice(0, 300)}`;
}

export function questionCancelledText(record: QuestionRequest): string {
  return `The user cancelled ${record.agentName || "the agent"}'s question.`;
}
