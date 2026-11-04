export type MemoryScope = "global" | "project";

export type MemoryOrigin = "manual" | "conversation";

export interface MemorySummary {
  id: string;
  scope: MemoryScope;
  projectId: string;
  projectName: string;
  instruction: string;
  origin: MemoryOrigin;
  sourceChatId: string;
  sourceChatTitle: string;
  sourceExists: boolean;
  sourceMessageId: string;
  excerpt: string;
  createdAt: string;
  updatedAt: string;
}

export type MemoryDetail = MemorySummary;

export interface MemoryListResponse {
  memories: Array<MemorySummary>;
}

export interface CreateMemoryRequest {
  instruction?: string;
  scope?: MemoryScope;
  projectId?: string;
  sourceChatId?: string;
  sourceMessageId?: string;
  excerpt?: string;
  idempotencyKey?: string;
}

export interface UpdateMemoryRequest {
  instruction?: string;
  scope?: MemoryScope;
  projectId?: string;
  expectedUpdatedAt?: string;
}

export interface UndoMemoryRequest {
  expectedUpdatedAt?: string;
  previousInstruction?: string;
  previousScope?: MemoryScope;
  previousProjectId?: string;
}

export interface MemoryReceipt {
  memoryId: string;
  scope: MemoryScope;
  projectId: string;
  action: "saved" | "updated";
  instruction: string;
  previousInstruction: string;
  previousScope: MemoryScope;
  previousProjectId: string;
  updatedAt: string;
  reversible: boolean;
}

export interface MemoryContextItem {
  id: string;
  scope: MemoryScope;
  projectId: string;
  instruction: string;
}
