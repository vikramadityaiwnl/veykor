import type { AgentDefinition } from "../work/index.js";
import type { ChatDetail } from "../chats/chat-contracts.js";

export type TeamMemberStatus =
  "idle" | "queued" | "running" | "completed" | "stopped" | "failed";

export interface TeamMember {
  id: string;
  agentId: string;
  name: string;
  task: string;
  status: TeamMemberStatus;
  error: string;
  isMain: boolean;
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
