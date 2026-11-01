import type { ProviderCliId } from "../providers/index.js";

export type ChatPermissionMode =
  "allowAll" | "promptUnmatched" | "onRequest" | "denyUnmatched";

export interface ChatApproval {
  id: string;
  toolName: string;
  arguments: string;
  choices: {
    choiceId: string;
    label: string;
    scope: string;
    rulePreview: string;
  }[];
}

export interface ChatActivity {
  id: string;
  kind: string;
  text: string;
  status: string;
}

export interface ChatModel {
  inputModalities?: ("text" | "image" | "video")[];
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  inputPrice: number;
  outputPrice: number;
  pricingAvailable: boolean;
}

export interface ChatProvider {
  id: ProviderCliId;
  name: string;
  available: boolean;
  error: string;
  source: string;
  models: ChatModel[];
}

export interface ChatCatalogResponse {
  providers: ChatProvider[];
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  costAvailable: boolean;
}

export interface ChatToolCall {
  id: string;
  name: string;
  target: string;
  status: "pending" | "running" | "complete" | "error";
  result: string;
  errorMessage: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "video" | "pdf" | "spreadsheet" | "text" | "document";
  dataUrl: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  usage: ChatUsage;
  createdAt: number;
  tools: ChatToolCall[];
  attachments: ChatAttachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  projectId: string | null;
  sectionId: string | null;
  providerId: string;
  modelId: string;
  nativeSessionId?: string;
  permissionMode?: ChatPermissionMode;
  status?: "idle" | "running" | "error";
  error?: string;
  approvals?: ChatApproval[];
  activities?: ChatActivity[];
  messages: ChatMessage[];
}

export interface ChatSessionsResponse {
  sessions: ChatSession[];
}

export interface ChatRequest {
  conversationId: string;
  messageId: string;
  permissionMode: ChatPermissionMode;
  providerId: ProviderCliId;
  modelId: string;
  messages: {
    role: "user" | "assistant";
    text: string;
    attachments?: ChatAttachment[];
  }[];
  systemPrompt: string;
}
