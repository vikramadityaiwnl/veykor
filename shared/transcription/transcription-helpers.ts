import type {
  TranscriptionClientMessage,
  TranscriptionServerMessage,
} from "./transcription-contracts.js";

export const transcriptionPaths = {
  stream: "/api/transcription/stream",
} as const;

export const transcriptionSampleRate = 24000;

export const transcriptionSocketCloseNormal = 1000;

export const transcriptionSocketCloseFailed = 1011;

export function isTranscriptionClientMessage(
  value: unknown,
): value is TranscriptionClientMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (value as { type?: unknown }).type === "end";
}

export function isTranscriptionServerMessage(
  value: unknown,
): value is TranscriptionServerMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const type = (value as { type?: unknown }).type;

  return type === "ready" || type === "transcript" || type === "error";
}

export function transcriptionSocketUrl(
  pageProtocol: string,
  host: string,
): string {
  const socketProtocol = pageProtocol === "https:" ? "wss" : "ws";

  return `${socketProtocol}://${host}${transcriptionPaths.stream}`;
}
