import type { ChatPermissionMode, ChatReasoningEffort } from "../chat/index.js";
import type { ProviderCliId } from "../providers/index.js";

export type AgentAccessMode = "unrestricted" | "restricted";

export interface Agent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  providerId: ProviderCliId;
  modelId: string;
  reasoningEffort: ChatReasoningEffort | "";
  permissionMode: ChatPermissionMode;
  projectIds: string[];
  toolsMode: AgentAccessMode;
  allowedTools: string[];
  skillsMode: AgentAccessMode;
  skillIds: string[];
  mcpMode: AgentAccessMode;
  mcpServerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentInput {
  name: string;
  description: string;
  instructions: string;
  providerId: ProviderCliId;
  modelId: string;
  reasoningEffort: ChatReasoningEffort | "";
  permissionMode: ChatPermissionMode;
  projectIds: string[];
  toolsMode: AgentAccessMode;
  allowedTools: string[];
  skillsMode: AgentAccessMode;
  skillIds: string[];
  mcpMode: AgentAccessMode;
  mcpServerIds: string[];
}

export interface UpdateAgentInput {
  name: string;
  description: string;
  instructions: string;
  providerId: ProviderCliId;
  modelId: string;
  reasoningEffort: ChatReasoningEffort | "";
  permissionMode: ChatPermissionMode;
  projectIds: string[];
  toolsMode: AgentAccessMode;
  allowedTools: string[];
  skillsMode: AgentAccessMode;
  skillIds: string[];
  mcpMode: AgentAccessMode;
  mcpServerIds: string[];
}

export interface AgentsResponse {
  agents: Agent[];
}

export interface ProjectAgent {
  id: string;
  name: string;
  description: string;
  providerId: ProviderCliId;
  modelId: string;
  reasoningEffort: ChatReasoningEffort | "";
  permissionMode: ChatPermissionMode;
}

export interface ProjectAgentsResponse {
  agents: ProjectAgent[];
}

export interface AgentSnapshot {
  agentId: string;
  name: string;
  providerId: string;
  modelId: string;
  reasoningEffort: ChatReasoningEffort;
  permissionMode: ChatPermissionMode;
  instructions: string;
  toolsMode: AgentAccessMode;
  allowedTools: string[];
  skillsMode: AgentAccessMode;
  skillIds: string[];
  mcpMode: AgentAccessMode;
  mcpServerIds: string[];
}
