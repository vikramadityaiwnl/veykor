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

export interface PullRequestCheck {
  name: string;
  status: string;
  conclusion: string;
}

export interface PullRequestReview {
  author: string;
  state: string;
}

export interface PullRequestDetail {
  number: number;
  title: string;
  body: string;
  state: string;
  merged: boolean;
  draft: boolean;
  author: string;
  url: string;
  headRef: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  mergeable: string;
  mergeState: string;
  reviewDecision: string;
  checks: Array<PullRequestCheck>;
  reviews: Array<PullRequestReview>;
  createdAt: string;
  updatedAt: string;
  mergedAt: string;
}
