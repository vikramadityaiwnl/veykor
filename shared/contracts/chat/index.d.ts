import type { ProviderCliId } from "../providers/index.js";

export interface ChatModel {
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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  usage: ChatUsage;
}

export interface ChatSession {
  id: string;
  title: string;
  projectId: string | null;
  sectionId: string | null;
  providerId: string;
  modelId: string;
  messages: ChatMessage[];
}

export interface ChatSessionsResponse {
  sessions: ChatSession[];
}

export interface ChatRequest {
  providerId: ProviderCliId;
  modelId: string;
  messages: { role: "user" | "assistant"; text: string }[];
  systemPrompt: string;
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "usage"; usage: ChatUsage }
  | { type: "error"; message: string }
  | { type: "done" };
