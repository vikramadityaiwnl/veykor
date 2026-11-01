import type { ProviderCliId } from "../providers/index.js";

export interface TranscriptionModel {
  id: string;
  name: string;
  description: string;
}

export interface TranscriptionProvider {
  id: ProviderCliId;
  name: string;
  available: boolean;
  error: string;
  source: string;
  models: TranscriptionModel[];
}

export interface TranscriptionCatalogResponse {
  providers: TranscriptionProvider[];
}

export interface TranscriptionDefaults {
  providerId: string;
  modelId: string;
}

export interface TranscribeEndFrame {
  type: "end";
}

export type TranscribeClientFrame = TranscribeEndFrame;

export type TranscribeServerFrame =
  | { type: "ready" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string; turnId: number }
  | { type: "error"; message: string };

export interface TranscriptionKeyStatus {
  configured: boolean;
  preview: string;
}

export interface UpdateTranscriptionKeyInput {
  key: string;
}
