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
  folderExists: boolean;
  hasGit: boolean;
}

export type AgentInput = Omit<AgentDefinition, "id">;
export type ProjectInput = Omit<
  WorkProject,
  "id" | "branch" | "folderExists" | "hasGit"
>;

export interface GitBranchInfo {
  name: string;
  current: boolean;
}

export interface GitDiff {
  hasGit: boolean;
  additions: number;
  deletions: number;
}

export interface GitBranches {
  current: string;
  branches: Array<GitBranchInfo>;
}

export interface CheckoutBranchRequest {
  name: string;
  create?: boolean;
}

export interface GitChangeLine {
  kind: "add" | "del" | "context" | "hunk";
  number: number;
  text: string;
}

export interface GitChangeFile {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
  truncated: boolean;
  lines: Array<GitChangeLine>;
}

export interface GitChanges {
  files: Array<GitChangeFile>;
}
