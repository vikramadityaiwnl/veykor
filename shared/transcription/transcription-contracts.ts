export type TranscriptionClientMessageType = "end";

export interface TranscriptionEndMessage {
  type: TranscriptionClientMessageType;
}

export type TranscriptionClientMessage = TranscriptionEndMessage;

export type TranscriptionServerMessageType = "ready" | "transcript" | "error";

export interface TranscriptionReadyMessage {
  type: "ready";
  sessionId: string;
}

export interface TranscriptionTranscriptMessage {
  type: "transcript";
  text: string;
  final: boolean;
}

export interface TranscriptionErrorMessage {
  type: "error";
  message: string;
}

export type TranscriptionServerMessage =
  | TranscriptionReadyMessage
  | TranscriptionTranscriptMessage
  | TranscriptionErrorMessage;
