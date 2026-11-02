import type { TranscriptionKeyStatus, UpdateTranscriptionKeyInput } from "@veykor/shared";

export function previewTranscriptionKey(key: string): string {
  if (key === "") {
    return "";
  }

  if (key.length >= 10) {
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
  }

  return "••••••";
}

export function keyStatus(key: string): TranscriptionKeyStatus {
  return {
    configured: key !== "",
    preview: previewTranscriptionKey(key),
  };
}

export function validTranscriptionKey(
  value: unknown,
): value is UpdateTranscriptionKeyInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const input = value as UpdateTranscriptionKeyInput;

  return typeof input.key === "string" && input.key.length <= 500;
}
