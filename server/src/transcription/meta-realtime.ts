export interface RealtimeHandshake {
  authorization: {
    accessToken: string;
  };
  audioEncoding: "PCM_24KHZ";
  model: string;
  mode: "PUSH_TO_TALK";
  partialMode: "CUMULATIVE";
  emitAudioProgress: false;
}

export type MetaServerEvent =
  | { kind: "ack"; sessionId: string }
  | { kind: "transcript"; text: string; final: boolean }
  | { kind: "error"; message: string; sessionId: string }
  | { kind: "ignore" };

export function buildRealtimeHandshake(
  apiKey: string,
  model: string,
): RealtimeHandshake {
  return {
    authorization: {
      accessToken: `Bearer ${apiKey}`,
    },
    audioEncoding: "PCM_24KHZ",
    model,
    mode: "PUSH_TO_TALK",
    partialMode: "CUMULATIVE",
    emitAudioProgress: false,
  };
}

export function metaEndStreamMessage(): string {
  return JSON.stringify({ type: "endStream" });
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  return typeof value === "string" ? value : "";
}

export function parseMetaServerEvent(raw: string): MetaServerEvent {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { kind: "ignore" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "ignore" };
  }

  const record = parsed as Record<string, unknown>;
  const type = record.type;

  if (type === undefined) {
    const sessionId = readString(record, "sessionId");

    if (sessionId === "") {
      return { kind: "ignore" };
    }

    return { kind: "ack", sessionId };
  }

  if (type === "transcript") {
    return {
      kind: "transcript",
      text: readString(record, "transcript"),
      final: record.final === true,
    };
  }

  if (type === "error") {
    const message = readString(record, "message");

    return {
      kind: "error",
      message: message === "" ? "The transcription service failed." : message,
      sessionId: readString(record, "sessionId"),
    };
  }

  return { kind: "ignore" };
}

export function metaCloseMessage(code: number): string {
  switch (code) {
    case 1008:
      return "The transcription request was rejected. Check the microphone and try again.";

    case 1011:
      return "The transcription service had a problem. Try again.";

    case 1013:
      return "The transcription service is busy. Try again in a moment.";

    default:
      return "Transcription ended unexpectedly. Try again.";
  }
}
