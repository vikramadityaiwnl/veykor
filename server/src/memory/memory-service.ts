import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  buildMemoryContextBlock,
  emptyMemoryList,
  maxExcerptLength,
  maxInstructionLength,
  memoryContainsSecret,
  memoryContextBudgetChars,
  memoryValidationError,
  normalizeInstruction,
  scoreMemoryInstruction,
} from "@veykor/shared";
import type {
  CreateMemoryRequest,
  MemoryContextItem,
  MemoryListResponse,
  MemoryOrigin,
  MemoryReceipt,
  MemoryScope,
  MemorySummary,
  UpdateMemoryRequest,
} from "@veykor/shared";
import { db } from "../db/client.js";
import { chats, memories, projects } from "../db/schema.js";

export type MemoryRow = typeof memories.$inferSelect;

export class MemoryFailure extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextStamp(current: string): string {
  const stamp = nowIso();

  if (stamp > current) {
    return stamp;
  }

  const parsed = new Date(current).getTime();

  if (Number.isNaN(parsed)) {
    return stamp;
  }

  return new Date(parsed + 1).toISOString();
}

function hashInstruction(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

function cleanInstruction(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readProjectName(userId: number, projectId: string): string {
  if (projectId === "") {
    return "";
  }

  const project = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();

  return project?.name ?? "";
}

function projectOwned(userId: number, projectId: string): boolean {
  if (projectId === "") {
    return false;
  }

  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();

  return project !== undefined;
}

function readSourceChat(
  userId: number,
  sourceChatId: string,
): { title: string; exists: boolean } {
  if (sourceChatId === "") {
    return { title: "", exists: false };
  }

  const chat = db
    .select({ title: chats.title })
    .from(chats)
    .where(and(eq(chats.id, sourceChatId), eq(chats.userId, userId)))
    .get();

  if (!chat) {
    return { title: "", exists: false };
  }

  return { title: chat.title ?? "", exists: true };
}

export function toMemorySummary(row: MemoryRow): MemorySummary {
  const scope: MemoryScope = row.scope === "project" ? "project" : "global";
  const origin: MemoryOrigin =
    row.origin === "conversation" ? "conversation" : "manual";
  const projectId = scope === "project" ? (row.projectId ?? "") : "";
  const source = readSourceChat(row.userId ?? 0, row.sourceChatId ?? "");

  return {
    id: row.id,
    scope,
    projectId,
    projectName:
      scope === "project" ? readProjectName(row.userId ?? 0, projectId) : "",
    instruction: row.instruction ?? "",
    origin,
    sourceChatId: row.sourceChatId ?? "",
    sourceChatTitle: source.title,
    sourceExists: source.exists,
    sourceMessageId: row.sourceMessageId ?? "",
    excerpt: row.sourceExcerpt ?? "",
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

export function readMemory(userId: number, id: string): MemoryRow | undefined {
  return db
    .select()
    .from(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)))
    .get();
}

function findByIdempotency(userId: number, key: string): MemoryRow | undefined {
  if (key === "") {
    return undefined;
  }

  return db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, userId), eq(memories.idempotencyKey, key)))
    .get();
}

function findDuplicate(
  userId: number,
  scope: MemoryScope,
  projectId: string,
  instructionHash: string,
  exceptId?: string,
): MemoryRow | undefined {
  if (instructionHash === "") {
    return undefined;
  }

  const rows = db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.scope, scope),
        eq(memories.projectId, projectId),
        eq(memories.instructionHash, instructionHash),
      ),
    )
    .all();

  return rows.find((row) => row.id !== exceptId);
}

function isUniqueViolation(cause: unknown): boolean {
  if (cause instanceof Error) {
    return (
      cause.message.includes("UNIQUE constraint failed") ||
      cause.message.includes("memories_user_key_idx") ||
      cause.message.includes("memories_user_dupe_idx")
    );
  }

  return false;
}

export function listMemories(
  userId: number,
  filters: { scope?: MemoryScope; projectId?: string; query?: string },
): MemoryListResponse {
  const conditions = [eq(memories.userId, userId)];

  if (filters.scope !== undefined) {
    conditions.push(eq(memories.scope, filters.scope));
  }

  if (filters.projectId !== undefined && filters.projectId !== "") {
    conditions.push(eq(memories.projectId, filters.projectId));
  }

  const rows = db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.updatedAt), desc(memories.createdAt))
    .all();

  const query = (filters.query ?? "").trim().toLowerCase();

  const filtered =
    query === ""
      ? rows
      : rows.filter((row) => {
          const instruction = (row.instruction ?? "").toLowerCase();
          const excerpt = (row.sourceExcerpt ?? "").toLowerCase();

          return instruction.includes(query) || excerpt.includes(query);
        });

  if (filtered.length === 0) {
    return emptyMemoryList();
  }

  return { memories: filtered.map(toMemorySummary) };
}

interface ManualCreateInput {
  instruction: string;
  scope: MemoryScope;
  projectId: string;
}

export function createMemory(
  userId: number,
  input: Partial<CreateMemoryRequest>,
): MemorySummary {
  const validationError = memoryValidationError(input, { partial: false });

  if (validationError !== "") {
    throw new MemoryFailure(400, validationError);
  }

  const instruction = cleanInstruction(input.instruction);
  const scope: MemoryScope = input.scope === "project" ? "project" : "global";
  const projectId = scope === "project" ? cleanId(input.projectId) : "";

  if (instruction.length > maxInstructionLength) {
    throw new MemoryFailure(
      400,
      "Keep the instruction under 2,000 characters.",
    );
  }

  if (scope === "project" && !projectOwned(userId, projectId)) {
    throw new MemoryFailure(404, "Project not found.");
  }

  const normalized = normalizeInstruction(instruction);
  const digest = hashInstruction(normalized);

  if (findDuplicate(userId, scope, projectId, digest)) {
    throw new MemoryFailure(409, "That memory already exists.");
  }

  const stamp = nowIso();
  const id = randomUUID();

  try {
    db.insert(memories)
      .values({
        id,
        userId,
        scope,
        projectId,
        instruction,
        instructionHash: digest,
        origin: "manual",
        sourceChatId: "",
        sourceMessageId: "",
        sourceExcerpt: "",
        idempotencyKey: "",
        createdAt: stamp,
        updatedAt: stamp,
      })
      .run();
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new MemoryFailure(409, "That memory already exists.");
    }

    throw cause;
  }

  const row = readMemory(userId, id);

  if (!row) {
    throw new MemoryFailure(500, "Unable to save the memory.");
  }

  return toMemorySummary(row);
}

export function updateMemory(
  userId: number,
  id: string,
  input: Partial<UpdateMemoryRequest>,
): { summary: MemorySummary; previous: ManualCreateInput } {
  const row = readMemory(userId, id);

  if (!row) {
    throw new MemoryFailure(404, "Memory not found.");
  }

  const validationError = memoryValidationError(input, { partial: true });

  if (validationError !== "") {
    throw new MemoryFailure(400, validationError);
  }

  if (
    input.expectedUpdatedAt !== undefined &&
    input.expectedUpdatedAt !== (row.updatedAt ?? "")
  ) {
    throw new MemoryFailure(
      409,
      "That memory changed elsewhere. Reload and try again.",
    );
  }

  const currentScope: MemoryScope =
    row.scope === "project" ? "project" : "global";
  const nextScope: MemoryScope =
    input.scope !== undefined ? input.scope : currentScope;

  let nextProjectId = row.projectId ?? "";

  if (input.scope !== undefined) {
    nextProjectId =
      nextScope === "project"
        ? cleanId(input.projectId ?? row.projectId ?? "")
        : "";
  } else if (input.projectId !== undefined) {
    if (nextScope === "global" && cleanId(input.projectId) !== "") {
      throw new MemoryFailure(
        400,
        "Global memories cannot belong to a project.",
      );
    }

    nextProjectId = nextScope === "project" ? cleanId(input.projectId) : "";
  }

  if (nextScope === "project" && nextProjectId === "") {
    throw new MemoryFailure(400, "Choose a project for project memories.");
  }

  if (nextScope === "project" && !projectOwned(userId, nextProjectId)) {
    throw new MemoryFailure(404, "Project not found.");
  }

  const nextInstruction =
    input.instruction !== undefined
      ? cleanInstruction(input.instruction)
      : (row.instruction ?? "");

  if (nextInstruction === "") {
    throw new MemoryFailure(400, "Write the memory instruction.");
  }

  if (nextInstruction.length > maxInstructionLength) {
    throw new MemoryFailure(
      400,
      "Keep the instruction under 2,000 characters.",
    );
  }

  const nextHash = hashInstruction(normalizeInstruction(nextInstruction));

  if (findDuplicate(userId, nextScope, nextProjectId, nextHash, row.id)) {
    throw new MemoryFailure(
      409,
      "Another memory already uses that instruction.",
    );
  }

  const previous: ManualCreateInput = {
    instruction: row.instruction ?? "",
    scope: currentScope,
    projectId: row.projectId ?? "",
  };

  try {
    db.update(memories)
      .set({
        instruction: nextInstruction,
        instructionHash: nextHash,
        scope: nextScope,
        projectId: nextProjectId,
        updatedAt: nextStamp(row.updatedAt ?? ""),
      })
      .where(and(eq(memories.id, row.id), eq(memories.userId, userId)))
      .run();
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new MemoryFailure(
        409,
        "Another memory already uses that instruction.",
      );
    }

    throw cause;
  }

  const updated = readMemory(userId, row.id);

  if (!updated) {
    throw new MemoryFailure(404, "Memory not found.");
  }

  return { summary: toMemorySummary(updated), previous };
}

export function deleteMemory(
  userId: number,
  id: string,
  expectedUpdatedAt?: string,
): void {
  const row = readMemory(userId, id);

  if (!row) {
    throw new MemoryFailure(404, "Memory not found.");
  }

  if (
    expectedUpdatedAt !== undefined &&
    expectedUpdatedAt !== (row.updatedAt ?? "")
  ) {
    throw new MemoryFailure(
      409,
      "That memory changed elsewhere. Reload and try again.",
    );
  }

  db.delete(memories)
    .where(and(eq(memories.id, row.id), eq(memories.userId, userId)))
    .run();
}

export function undoMemory(
  userId: number,
  id: string,
  input: {
    expectedUpdatedAt?: string;
    previousInstruction?: string;
    previousScope?: MemoryScope;
    previousProjectId?: string;
  },
): { deleted: true } | { summary: MemorySummary } {
  const row = readMemory(userId, id);

  if (!row) {
    throw new MemoryFailure(404, "Memory not found.");
  }

  if (
    input.expectedUpdatedAt !== undefined &&
    input.expectedUpdatedAt !== "" &&
    input.expectedUpdatedAt !== (row.updatedAt ?? "")
  ) {
    throw new MemoryFailure(
      409,
      "That memory was edited after this receipt. Undo is no longer available.",
    );
  }

  if (input.previousInstruction === undefined) {
    db.delete(memories)
      .where(and(eq(memories.id, row.id), eq(memories.userId, userId)))
      .run();

    return { deleted: true };
  }

  const previousInstruction = cleanInstruction(input.previousInstruction);

  if (previousInstruction === "") {
    throw new MemoryFailure(400, "That undo is no longer available.");
  }

  const previousScope: MemoryScope =
    input.previousScope === "project" ? "project" : "global";
  const previousProjectId =
    previousScope === "project" ? cleanId(input.previousProjectId) : "";

  if (previousScope === "project" && !projectOwned(userId, previousProjectId)) {
    throw new MemoryFailure(404, "Project not found.");
  }

  const previousHash = hashInstruction(
    normalizeInstruction(previousInstruction),
  );

  if (
    findDuplicate(
      userId,
      previousScope,
      previousProjectId,
      previousHash,
      row.id,
    )
  ) {
    throw new MemoryFailure(
      409,
      "Another memory already uses that instruction.",
    );
  }

  db.update(memories)
    .set({
      instruction: previousInstruction,
      instructionHash: previousHash,
      scope: previousScope,
      projectId: previousProjectId,
      updatedAt: nextStamp(row.updatedAt ?? ""),
    })
    .where(and(eq(memories.id, row.id), eq(memories.userId, userId)))
    .run();

  const restored = readMemory(userId, row.id);

  if (!restored) {
    throw new MemoryFailure(404, "Memory not found.");
  }

  return { summary: toMemorySummary(restored) };
}

export interface ConversationSaveInput {
  instruction: string;
  scope: MemoryScope;
  projectId: string;
  sourceChatId: string;
  sourceMessageId: string;
  excerpt: string;
  idempotencyKey: string;
}

export function saveConversationMemory(
  userId: number,
  input: ConversationSaveInput,
): { summary: MemorySummary; reused: boolean; receipt: MemoryReceipt } {
  const instruction = cleanInstruction(input.instruction);

  if (instruction === "") {
    throw new MemoryFailure(400, "Write the memory instruction.");
  }

  if (instruction.length > maxInstructionLength) {
    throw new MemoryFailure(
      400,
      "Keep the instruction under 2,000 characters.",
    );
  }

  if (memoryContainsSecret(instruction)) {
    throw new MemoryFailure(
      400,
      "That looks like a credential or secret. Memories cannot store secrets.",
    );
  }

  const scope: MemoryScope = input.scope === "project" ? "project" : "global";
  const projectId = scope === "project" ? cleanId(input.projectId) : "";

  if (scope === "project" && !projectOwned(userId, projectId)) {
    throw new MemoryFailure(404, "Project not found.");
  }

  const sourceChatId = cleanId(input.sourceChatId);
  const ownedSource =
    sourceChatId !== "" && readSourceChat(userId, sourceChatId).exists;
  const storedSourceChatId = ownedSource ? sourceChatId : "";
  const sourceMessageId = cleanId(input.sourceMessageId).slice(0, 200);
  const excerpt = cleanId(input.excerpt).slice(0, maxExcerptLength);
  const idempotencyKey = cleanId(input.idempotencyKey).slice(0, 200);

  if (idempotencyKey !== "") {
    const existing = findByIdempotency(userId, idempotencyKey);

    if (existing) {
      const summary = toMemorySummary(existing);

      return {
        summary,
        reused: true,
        receipt: {
          memoryId: summary.id,
          scope: summary.scope,
          projectId: summary.projectId,
          action: "saved",
          instruction: summary.instruction,
          previousInstruction: "",
          previousScope: summary.scope,
          previousProjectId: "",
          updatedAt: summary.updatedAt,
          reversible: true,
        },
      };
    }
  }

  const digest = hashInstruction(normalizeInstruction(instruction));
  const duplicate = findDuplicate(userId, scope, projectId, digest);

  if (duplicate) {
    const summary = toMemorySummary(duplicate);

    return {
      summary,
      reused: true,
      receipt: {
        memoryId: summary.id,
        scope: summary.scope,
        projectId: summary.projectId,
        action: "saved",
        instruction: summary.instruction,
        previousInstruction: "",
        previousScope: summary.scope,
        previousProjectId: "",
        updatedAt: summary.updatedAt,
        reversible: false,
      },
    };
  }

  const stamp = nowIso();
  const id = randomUUID();

  try {
    db.insert(memories)
      .values({
        id,
        userId,
        scope,
        projectId,
        instruction,
        instructionHash: digest,
        origin: "conversation",
        sourceChatId: storedSourceChatId,
        sourceMessageId: sourceMessageId,
        sourceExcerpt: excerpt,
        idempotencyKey,
        createdAt: stamp,
        updatedAt: stamp,
      })
      .run();
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      const fallback =
        (idempotencyKey !== ""
          ? findByIdempotency(userId, idempotencyKey)
          : undefined) ?? findDuplicate(userId, scope, projectId, digest);

      if (fallback) {
        const summary = toMemorySummary(fallback);

        return {
          summary,
          reused: true,
          receipt: {
            memoryId: summary.id,
            scope: summary.scope,
            projectId: summary.projectId,
            action: "saved",
            instruction: summary.instruction,
            previousInstruction: "",
            previousScope: summary.scope,
            previousProjectId: "",
            updatedAt: summary.updatedAt,
            reversible: false,
          },
        };
      }

      throw new MemoryFailure(409, "That memory already exists.");
    }

    throw cause;
  }

  const row = readMemory(userId, id);

  if (!row) {
    throw new MemoryFailure(500, "Unable to save the memory.");
  }

  const summary = toMemorySummary(row);

  return {
    summary,
    reused: false,
    receipt: {
      memoryId: summary.id,
      scope: summary.scope,
      projectId: summary.projectId,
      action: "saved",
      instruction: summary.instruction,
      previousInstruction: "",
      previousScope: summary.scope,
      previousProjectId: "",
      updatedAt: summary.updatedAt,
      reversible: true,
    },
  };
}

export function updateConversationMemory(
  userId: number,
  id: string,
  input: {
    instruction?: string;
    scope?: MemoryScope;
    projectId?: string;
  },
): { summary: MemorySummary; receipt: MemoryReceipt } {
  const { summary, previous } = updateMemory(userId, id, input);

  return {
    summary,
    receipt: {
      memoryId: summary.id,
      scope: summary.scope,
      projectId: summary.projectId,
      action: "updated",
      instruction: summary.instruction,
      previousInstruction: previous.instruction,
      previousScope: previous.scope,
      previousProjectId: previous.projectId,
      updatedAt: summary.updatedAt,
      reversible: true,
    },
  };
}

export function deleteProjectMemories(userId: number, projectId: string): void {
  db.delete(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.scope, "project"),
        eq(memories.projectId, projectId),
      ),
    )
    .run();
}

export function eligibleMemoryRows(
  userId: number,
  projectId: string,
): Array<MemoryRow> {
  const rows = db
    .select()
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.updatedAt))
    .all();

  return rows.filter((row) => {
    if (row.scope === "global") {
      return true;
    }

    return projectId !== "" && row.projectId === projectId;
  });
}

export function buildMemoryContext(
  userId: number,
  projectId: string,
  userText: string,
): { text: string; items: Array<MemoryContextItem> } {
  const eligible = eligibleMemoryRows(userId, projectId);

  const globals = eligible
    .filter((row) => row.scope !== "project")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  const scored = eligible
    .filter((row) => row.scope === "project")
    .map((row) => ({
      row,
      score: scoreMemoryInstruction(row.instruction ?? "", userText),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return (b.row.updatedAt ?? "").localeCompare(a.row.updatedAt ?? "");
    })
    .map((entry) => entry.row);

  const ordered = [...globals, ...scored];
  const items: Array<MemoryContextItem> = [];
  let used = 0;

  for (const row of ordered) {
    const instruction = row.instruction ?? "";
    const cost = instruction.length + 60;

    if (used + cost > memoryContextBudgetChars) {
      break;
    }

    used += cost;
    items.push({
      id: row.id,
      scope: row.scope === "project" ? "project" : "global",
      projectId: row.projectId ?? "",
      instruction,
    });

    if (items.length >= 20) {
      break;
    }
  }

  return { text: buildMemoryContextBlock(items), items };
}
