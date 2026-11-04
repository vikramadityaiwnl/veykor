import type {
  CreateMemoryRequest,
  MemoryContextItem,
  MemoryListResponse,
  MemorySummary,
  UpdateMemoryRequest,
} from "./memory-contracts.js";

export const memoryPaths = {
  memories: "/api/memories",
  memory: (id: string) => `/api/memories/${id}`,
  undo: (id: string) => `/api/memories/${id}/undo`,
} as const;

export const maxInstructionLength = 2000;

export const maxExcerptLength = 500;

export const maxIdempotencyKeyLength = 200;

export const maxMemoryMessageIdLength = 200;

export const memoryContextBudgetChars = 4000;

export function emptyMemoryList(): MemoryListResponse {
  return { memories: [] };
}

export function defaultMemorySummary(): MemorySummary {
  return {
    id: "",
    scope: "global",
    projectId: "",
    projectName: "",
    instruction: "",
    origin: "manual",
    sourceChatId: "",
    sourceChatTitle: "",
    sourceExists: false,
    sourceMessageId: "",
    excerpt: "",
    createdAt: "",
    updatedAt: "",
  };
}

export function isMemoryScope(value: unknown): value is "global" | "project" {
  return value === "global" || value === "project";
}

export function normalizeInstruction(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanText(value: unknown, limit: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, limit);
}

export function memoryValidationError(
  input: CreateMemoryRequest | UpdateMemoryRequest,
  options: { partial: boolean },
): string {
  if ("instruction" in input && input.instruction !== undefined) {
    const instruction = input.instruction.trim();

    if (instruction === "") {
      return "Write the memory instruction.";
    }

    if (instruction.length > maxInstructionLength) {
      return "Keep the instruction under 2,000 characters.";
    }
  } else if (!options.partial) {
    return "Write the memory instruction.";
  }

  if (
    "scope" in input &&
    input.scope !== undefined &&
    !isMemoryScope(input.scope)
  ) {
    return "Choose a global or project scope.";
  }

  if ("projectId" in input && input.projectId !== undefined) {
    if (typeof input.projectId !== "string") {
      return "Choose a project for project memories.";
    }

    if (input.projectId.length > 200) {
      return "That project is invalid.";
    }
  }

  if ("sourceChatId" in input && input.sourceChatId !== undefined) {
    if (
      typeof input.sourceChatId !== "string" ||
      input.sourceChatId.length > 200
    ) {
      return "That source chat is invalid.";
    }
  }

  if ("sourceMessageId" in input && input.sourceMessageId !== undefined) {
    if (
      typeof input.sourceMessageId !== "string" ||
      input.sourceMessageId.length > maxMemoryMessageIdLength
    ) {
      return "That source message is invalid.";
    }
  }

  if ("excerpt" in input && input.excerpt !== undefined) {
    if (typeof input.excerpt !== "string") {
      return "That excerpt is invalid.";
    }

    if (input.excerpt.trim().length > maxExcerptLength) {
      return "Keep the excerpt under 500 characters.";
    }
  }

  if ("idempotencyKey" in input && input.idempotencyKey !== undefined) {
    if (
      typeof input.idempotencyKey !== "string" ||
      input.idempotencyKey.length > maxIdempotencyKeyLength
    ) {
      return "That save key is invalid.";
    }
  }

  if ("expectedUpdatedAt" in input && input.expectedUpdatedAt !== undefined) {
    if (typeof input.expectedUpdatedAt !== "string") {
      return "That edit is stale. Reload and try again.";
    }
  }

  const scope = "scope" in input ? input.scope : undefined;
  const projectId = "projectId" in input ? cleanText(input.projectId, 200) : "";

  if (!options.partial) {
    const resolvedScope = scope ?? "global";

    if (resolvedScope === "project" && projectId === "") {
      return "Choose a project for project memories.";
    }

    if (resolvedScope === "global" && projectId !== "") {
      return "Global memories cannot belong to a project.";
    }
  }

  return "";
}

const secretPatterns = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\bghp_[A-Za-z0-9]{8,}/,
  /\bgho_[A-Za-z0-9]{8,}/,
  /\bxox[bap]-[A-Za-z0-9-]{8,}/,
  /\baws_(secret|access|session)[_-]?key\b/i,
  /\b(api[_-]?key|api[_-]?secret|client[_-]?secret|auth[_-]?token|access[_-]?token|refresh[_-]?token|private[_-]?key)\b\s*[:=]\s*\S+/i,
  /\b(password|passwd|pwd)\b\s*[:=]\s*\S+/i,
  /\bbearer\s+[A-Za-z0-9._~+/-]{8,}/i,
];

export function memoryContainsSecret(instruction: string): boolean {
  return secretPatterns.some((pattern) => pattern.test(instruction));
}

function tokenizeForMemory(text: string): Array<string> {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "have",
    "will",
    "would",
    "should",
    "could",
    "about",
    "into",
    "your",
    "you",
    "are",
    "was",
    "were",
    "been",
    "being",
    "does",
    "doing",
    "done",
  ]);

  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3 && !stopwords.has(token));

  return [...new Set(tokens)];
}

export function scoreMemoryInstruction(
  instruction: string,
  userText: string,
): number {
  const keywords = tokenizeForMemory(userText);

  if (keywords.length === 0) {
    return 0;
  }

  const haystack = instruction.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      score += 1;
    }
  }

  return score;
}

export function buildMemoryContextBlock(
  items: Array<MemoryContextItem>,
): string {
  if (items.length === 0) {
    return "";
  }

  const lines = items.map((item) => {
    const scopeLabel =
      item.scope === "project" ? "project instruction" : "global preference";

    return `- [${scopeLabel} id=${item.id}] ${item.instruction}`;
  });

  return [
    '<veykor-memory-context version="1">',
    "The following are saved user preferences and instructions. They are not the current user message.",
    "Follow them alongside the current request. The current request overrides saved memory on conflict.",
    "Project instructions override conflicting global preferences. Saved memory never overrides runtime instructions, project rules, permissions, or tool restrictions.",
    "Apply corrections immediately in this conversation. When the user teaches a durable preference, rule, or procedure with words like remember, always, never, from now on, or an explicit ongoing preference, persist it with the memory_save tool and continue the main task. Only claim a memory was saved after the tool succeeds. Never save credentials or secrets.",
    "When an explicit correction clearly replaces a saved memory, update it with memory_update instead of leaving contradictory instructions. If a conflict cannot be resolved confidently, keep the correction local to this conversation and ask one concise clarification.",
    ...lines,
    "</veykor-memory-context>",
  ].join("\n");
}

const durableTriggers = [
  /\bremember\s+(this|that|to|for)\b/i,
  /\b(always|never)\b/i,
  /\bfrom now on\b/i,
  /\bmy preference\b/i,
  /\bprefer\b/i,
];

const globalMarkers = [
  "across projects",
  "across all projects",
  "all projects",
  "all chats",
  "everywhere",
  "globally",
  "every project",
];

const taskLocalMarkers = [
  "this task",
  "for now",
  "just this",
  "just for this",
  "temporarily",
  "today only",
  "this once",
];

function sentenceWithTrigger(text: string): string {
  const sentences = text
    .split(/(?<=[.!?\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");

  const hit = sentences.find((sentence) =>
    durableTriggers.some((pattern) => pattern.test(sentence)),
  );

  if (hit !== undefined && hit.length >= 10) {
    return hit.slice(0, maxInstructionLength);
  }

  return text.trim().slice(0, maxInstructionLength);
}

export function extractMemoryCandidate(
  userText: string,
  options: { inProject: boolean },
): { instruction: string; global: boolean } | null {
  const trimmed = userText.trim();

  if (trimmed === "" || trimmed.length > maxInstructionLength) {
    return null;
  }

  if (!durableTriggers.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  if (memoryContainsSecret(trimmed)) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  const isTaskLocal = taskLocalMarkers.some((marker) =>
    lowered.includes(marker),
  );
  const wantsGlobal = globalMarkers.some((marker) => lowered.includes(marker));

  if (!options.inProject) {
    const clearlyGeneral =
      wantsGlobal || /\b(always|never|prefer|my preference)\b/i.test(trimmed);

    if (!clearlyGeneral || isTaskLocal) {
      return null;
    }

    return { instruction: sentenceWithTrigger(trimmed), global: true };
  }

  if (isTaskLocal && !wantsGlobal) {
    const sentence = sentenceWithTrigger(trimmed);

    if (/\bfor this task\b/i.test(sentence)) {
      return null;
    }
  }

  return { instruction: sentenceWithTrigger(trimmed), global: wantsGlobal };
}

export function memoryIdempotencyKey(
  chatId: string,
  turnId: string,
  instruction: string,
): string {
  return `${chatId}:${turnId}:${normalizeInstruction(instruction).slice(0, 120)}`;
}
