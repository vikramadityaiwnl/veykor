export const transcribeModel = "muse-voice-transcribe-1.0";
export const transcribeMode = "ENDPOINTING";
export const transcribeEncoding = "PCM_24KHZ";
export const transcribeSampleRate = 24000;

export function handshakeFrame(apiKey: string): string {
  return JSON.stringify({
    authorization: { accessToken: `Bearer ${apiKey}` },
    audioEncoding: transcribeEncoding,
    model: transcribeModel,
    mode: transcribeMode,
    emitAudioProgress: false,
  });
}

export type AsrEvent =
  | { kind: "partial"; text: string }
  | { kind: "complete"; text: string; turnId: number }
  | { kind: "error"; message: string }
  | { kind: "ignore" };

export function mapServerEvent(raw: unknown): AsrEvent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "ignore" };
  }

  const event = raw as {
    type?: unknown;
    transcript?: unknown;
    turnId?: unknown;
    message?: unknown;
  };

  switch (event.type) {
    case "transcript":
      return typeof event.transcript === "string"
        ? { kind: "partial", text: event.transcript }
        : { kind: "ignore" };
    case "speechComplete":
      return typeof event.transcript === "string" &&
        typeof event.turnId === "number"
        ? { kind: "complete", text: event.transcript, turnId: event.turnId }
        : { kind: "ignore" };
    case "error":
      return {
        kind: "error",
        message:
          typeof event.message === "string" && event.message !== ""
            ? event.message
            : "Transcription failed. Please try again.",
      };
    default:
      return { kind: "ignore" };
  }
}

export function closeMessage(code: number, reason: string): string | undefined {
  if (code === 1000) {
    return undefined;
  }

  if (code === 1013) {
    return "Transcription is rate limited. Please wait and try again.";
  }

  if (code === 1011) {
    return reason === "Max session duration reached"
      ? "The transcription session reached its time limit. Please start again."
      : "Transcription failed. Please try again.";
  }

  if (code === 1008) {
    return "Transcription rejected the audio stream. Please try again.";
  }

  return reason || "Transcription ended unexpectedly. Please try again.";
}
