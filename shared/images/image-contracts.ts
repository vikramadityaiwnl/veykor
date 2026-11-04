export type GeneratedImageStatus = "generating" | "completed" | "failed";

export interface GeneratedImageArtifact {
  id: string;
  chatId: string;
  rootId: string;
  prompt: string;
  size: string;
  status: GeneratedImageStatus;
  error: string;
  mediaType: string;
  byteSize: number;
  turnId: string;
  toolItemId: string;
  url: string;
  downloadUrl: string;
  createdAt: string;
  completedAt: string;
}

export interface GenerateImageToolResult {
  artifactId: string;
  url: string;
  downloadUrl: string;
  mediaType: string;
  byteSize: number;
  message: string;
}
