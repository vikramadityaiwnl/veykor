export interface TranscriptionConfig {
  apiKey: string;
  model: string;
  realtimeUrl: string;
}

export const defaultTranscriptionModel = "muse-voice-transcribe-1.0";

export const defaultTranscriptionRealtimeUrl =
  "wss://api.meta.ai/v1/asr/realtime";

export function loadTranscriptionConfig(
  env: NodeJS.ProcessEnv = process.env,
): TranscriptionConfig {
  const apiKey = (env.MODEL_API_KEY ?? "").trim();
  const model = (env.ASR_MODEL ?? "").trim() || defaultTranscriptionModel;
  const realtimeUrl =
    (env.ASR_REALTIME_URL ?? "").trim() || defaultTranscriptionRealtimeUrl;

  return { apiKey, model, realtimeUrl };
}

export function transcriptionRealtimeUrlWithSession(
  realtimeUrl: string,
  sessionId: string,
): string {
  const separator = realtimeUrl.includes("?") ? "&" : "?";

  return `${realtimeUrl}${separator}sessionId=${encodeURIComponent(sessionId)}`;
}
