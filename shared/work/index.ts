import type { ChatPermission } from "../chats/chat-contracts.js";

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  avatar: string;
  instructions: string;
  modelId: string;
  providerId: string;
  reasoningEffort: string;
  permission: ChatPermission;
  autoAddToNewProjects: boolean;
}

export interface WorkProject {
  id: string;
  name: string;
  folder: string;
  sectionId: string;
  agentIds: string[];
  branch: string;
}

export type AgentInput = Omit<AgentDefinition, "id">;
export type ProjectInput = Omit<WorkProject, "id" | "branch">;
