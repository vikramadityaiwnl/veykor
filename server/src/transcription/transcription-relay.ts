import {
  isTranscriptionClientMessage,
  transcriptionSocketCloseFailed,
  transcriptionSocketCloseNormal,
} from "@veykor/shared";
import type { TranscriptionServerMessage } from "@veykor/shared";
import {
  buildRealtimeHandshake,
  metaCloseMessage,
  metaEndStreamMessage,
  parseMetaServerEvent,
} from "./meta-realtime.js";

export type RelayMessageListener = (data: unknown, isBinary: boolean) => void;

export type RelayCloseListener = (code: number) => void;

export interface RelaySocket {
  readonly readyState: number;
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  on(event: "open", listener: () => void): unknown;
  on(event: "message", listener: RelayMessageListener): unknown;
  on(event: "close", listener: RelayCloseListener): unknown;
  on(event: "error", listener: () => void): unknown;
}

export const relaySocketOpen = 1;

export const relayHandshakeTimeoutMs = 15000;

const maxPendingAudioBytes = 2 * 1024 * 1024;

export interface TranscriptionRelayOptions {
  downstream: RelaySocket;
  upstream: RelaySocket;
  apiKey: string;
  model: string;
  handshakeTimeoutMs?: number;
}

function toAudioBuffer(data: unknown): Buffer | null {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  if (Array.isArray(data) && data.every((entry) => Buffer.isBuffer(entry))) {
    return Buffer.concat(data as Array<Buffer>);
  }

  return null;
}

function toTextMessage(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }

  const bytes = toAudioBuffer(data);

  if (bytes === null) {
    return null;
  }

  return bytes.toString("utf8");
}

function isEndMessage(data: unknown): boolean {
  const text = toTextMessage(data);

  if (text === null) {
    return false;
  }

  try {
    return isTranscriptionClientMessage(JSON.parse(text) as unknown);
  } catch {
    return false;
  }
}

export function startTranscriptionRelay(
  options: TranscriptionRelayOptions,
): void {
  const downstream = options.downstream;
  const upstream = options.upstream;
  const timeoutMs = options.handshakeTimeoutMs ?? relayHandshakeTimeoutMs;

  let handshakeSent = false;
  let ackReceived = false;
  let inputEnded = false;
  let pendingEnd = false;
  let errorSent = false;
  let settled = false;
  let pendingAudio: Array<Buffer> = [];
  let pendingBytes = 0;

  function sendDownstream(message: TranscriptionServerMessage): void {
    if (downstream.readyState !== relaySocketOpen) {
      return;
    }

    try {
      downstream.send(JSON.stringify(message));
    } catch {
      // The browser is gone; closing the session releases the upstream.
    }
  }

  function closeDownstream(code: number): void {
    if (
      downstream.readyState === relaySocketOpen ||
      downstream.readyState === 0
    ) {
      try {
        downstream.close(code);
      } catch {
        // Already closing.
      }
    }
  }

  function closeUpstream(code: number): void {
    if (upstream.readyState === relaySocketOpen || upstream.readyState === 0) {
      try {
        upstream.close(code);
      } catch {
        // Already closing.
      }
    }
  }

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function fail(message: string): void {
    if (settled) {
      return;
    }

    settled = true;
    clearTimer();

    if (!errorSent) {
      errorSent = true;
      sendDownstream({ type: "error", message });
    }

    closeUpstream(transcriptionSocketCloseNormal);
    closeDownstream(transcriptionSocketCloseFailed);
  }

  function finish(): void {
    if (settled) {
      return;
    }

    settled = true;
    clearTimer();
    closeDownstream(transcriptionSocketCloseNormal);
  }

  function flushPendingAudio(): void {
    if (upstream.readyState !== relaySocketOpen) {
      return;
    }

    for (const chunk of pendingAudio) {
      try {
        upstream.send(chunk);
      } catch {
        fail("The transcription service closed unexpectedly. Try again.");

        return;
      }
    }

    pendingAudio = [];
    pendingBytes = 0;

    if (pendingEnd) {
      pendingEnd = false;

      try {
        upstream.send(metaEndStreamMessage());
      } catch {
        fail("The transcription service closed unexpectedly. Try again.");
      }
    }
  }

  function sendHandshake(): void {
    if (handshakeSent || upstream.readyState !== relaySocketOpen) {
      return;
    }

    handshakeSent = true;

    try {
      upstream.send(
        JSON.stringify(buildRealtimeHandshake(options.apiKey, options.model)),
      );
    } catch {
      fail("The transcription service closed unexpectedly. Try again.");
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    timer = undefined;
    fail("The transcription service did not respond. Try again.");
  }, timeoutMs);

  downstream.on("error", () => {});
  upstream.on("error", () => {});

  upstream.on("open", () => {
    sendHandshake();
  });

  sendHandshake();

  downstream.on("message", (data, isBinary) => {
    if (settled) {
      return;
    }

    if (isBinary) {
      const audio = toAudioBuffer(data);

      if (audio === null || audio.length === 0) {
        return;
      }

      if (ackReceived) {
        if (upstream.readyState !== relaySocketOpen) {
          return;
        }

        try {
          upstream.send(audio);
        } catch {
          fail("The transcription service closed unexpectedly. Try again.");
        }

        return;
      }

      if (pendingBytes + audio.length > maxPendingAudioBytes) {
        fail("The transcription service did not respond. Try again.");

        return;
      }

      pendingAudio.push(audio);
      pendingBytes += audio.length;

      return;
    }

    if (!isEndMessage(data) || inputEnded) {
      return;
    }

    inputEnded = true;

    if (!ackReceived) {
      pendingEnd = true;

      return;
    }

    if (upstream.readyState !== relaySocketOpen) {
      return;
    }

    try {
      upstream.send(metaEndStreamMessage());
    } catch {
      fail("The transcription service closed unexpectedly. Try again.");
    }
  });

  downstream.on("close", () => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimer();
    closeUpstream(transcriptionSocketCloseNormal);
  });

  upstream.on("message", (data, isBinary) => {
    if (settled || isBinary) {
      return;
    }

    const text = toTextMessage(data);

    if (text === null) {
      return;
    }

    const event = parseMetaServerEvent(text);

    if (!ackReceived) {
      if (event.kind === "ack") {
        ackReceived = true;
        clearTimer();
        sendDownstream({ type: "ready", sessionId: event.sessionId });
        flushPendingAudio();
      } else if (event.kind === "error") {
        fail(event.message);
      }

      return;
    }

    if (event.kind === "transcript") {
      sendDownstream({
        type: "transcript",
        text: event.text,
        final: event.final,
      });
    } else if (event.kind === "error") {
      fail(event.message);
    }
  });

  upstream.on("close", (code) => {
    if (settled) {
      return;
    }

    if (code === transcriptionSocketCloseNormal) {
      finish();

      return;
    }

    fail(metaCloseMessage(code));
  });
}
