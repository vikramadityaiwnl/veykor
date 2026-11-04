import type { AgentDefinition } from "../work/index.js";
import type { ChatDetail } from "../chats/chat-contracts.js";

export type TeamMemberStatus =
  "idle" | "queued" | "running" | "completed" | "stopped" | "failed";

export interface TeamTodo {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

export interface TeamQueuedMessage {
  id: string;
  text: string;
  imageCount: number;
}

export interface TeamMember {
  id: string;
  agentId: string;
  name: string;
  task: string;
  status: TeamMemberStatus;
  error: string;
  isMain: boolean;
  todos: TeamTodo[];
  queuedMessages: TeamQueuedMessage[];
}

export interface TeamEvent {
  id: number;
  senderId: string;
  recipientId: string;
  kind: string;
  text: string;
  createdAt: string;
}

export interface TeamSnapshot {
  rootId: string;
  members: TeamMember[];
  events: TeamEvent[];
  availableAgents: AgentDefinition[];
}

export interface DelegateRequest {
  agentId: string;
  task: string;
}

export interface TeamMemberDetail {
  member: TeamMember;
  detail: ChatDetail;
}

export const teamPaths = {
  team: (rootId: string) => `/api/teams/${rootId}`,
  delegate: (rootId: string) => `/api/teams/${rootId}/members`,
};

export function normalizeTeamTodos(value: unknown): TeamTodo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 100).flatMap((entry, index) => {
    const item =
      typeof entry === "string"
        ? { text: entry }
        : (entry as Record<string, unknown> | null);

    if (!item || typeof item !== "object") {
      return [];
    }

    const rawText = item.text ?? item.content ?? item.title ?? item.label;

    if (typeof rawText !== "string" || !rawText.trim()) {
      return [];
    }

    const status = String(item.status ?? "pending");
    const normalized: TeamTodo["status"] = [
      "completed",
      "complete",
      "done",
    ].includes(status)
      ? "completed"
      : ["inProgress", "in_progress", "in-progress", "active"].includes(status)
        ? "in_progress"
        : ["cancelled", "canceled"].includes(status)
          ? "cancelled"
          : "pending";

    return [
      {
        id:
          typeof item.id === "string"
            ? item.id.slice(0, 64)
            : String(index + 1),
        text: rawText.trim().slice(0, 1000),
        status: normalized,
      },
    ];
  });
}
