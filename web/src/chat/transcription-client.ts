import {
  isTranscriptionServerMessage,
  transcriptionSampleRate,
  transcriptionSocketUrl,
} from "@veykor/shared";
import type { TranscriptionServerMessage } from "@veykor/shared";
import captureWorkletUrl from "./transcription-capture.worklet.js?worker&url";

export type MicrophonePermissionState = "granted" | "denied" | "prompt";

export type MicrophoneFailureKind = "blocked" | "dismissed" | "no-device";

export interface MicrophoneFailure {
  kind: MicrophoneFailureKind;
  message: string;
}

export interface TranscriptionEvents {
  onReady: () => void;
  onTranscript: (text: string, final: boolean) => void;
  onError: (message: string) => void;
  onClosed: () => void;
}

export interface ActiveTranscription {
  stop: () => Promise<string>;
  abort: () => void;
}

const socketOpenTimeoutMs = 10000;

const flushTimeoutMs = 10000;

export async function queryMicrophonePermission(): Promise<MicrophonePermissionState> {
  try {
    if (
      typeof navigator === "undefined" ||
      navigator.permissions === undefined ||
      typeof navigator.permissions.query !== "function"
    ) {
      return "prompt";
    }

    const status = await navigator.permissions.query({
      name: "microphone",
    });

    if (status.state === "granted" || status.state === "denied") {
      return status.state;
    }

    return "prompt";
  } catch {
    return "prompt";
  }
}

export function classifyMicrophoneFailure(
  error: DOMException,
  permission: MicrophonePermissionState,
): MicrophoneFailure {
  if (
    error.name === "NotFoundError" ||
    error.name === "OverconstrainedError" ||
    error.name === "NotReadableError"
  ) {
    return {
      kind: "no-device",
      message: "No microphone was found. Connect one and try again.",
    };
  }

  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    if (permission === "denied") {
      return {
        kind: "blocked",
        message:
          "Microphone access is blocked. Allow it in your browser's site settings, then try again.",
      };
    }

    return {
      kind: "dismissed",
      message: "Microphone access was dismissed. Try again to dictate.",
    };
  }

  return {
    kind: "no-device",
    message: "The microphone is unavailable in this browser.",
  };
}

function readField(record: object, key: string): string {
  const value = (record as Record<string, unknown>)[key];

  return typeof value === "string" ? value : "";
}

function parseServerMessage(raw: string): TranscriptionServerMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!isTranscriptionServerMessage(parsed)) {
    return null;
  }

  if (parsed.type === "ready") {
    return { type: "ready", sessionId: readField(parsed, "sessionId") };
  }

  if (parsed.type === "transcript") {
    return {
      type: "transcript",
      text: readField(parsed, "text"),
      final: (parsed as { final?: unknown }).final === true,
    };
  }

  const message = readField(parsed, "message");

  return {
    type: "error",
    message: message === "" ? "Transcription failed. Try again." : message,
  };
}

function openSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      transcriptionSocketUrl(window.location.protocol, window.location.host),
    );

    const timer = window.setTimeout(() => {
      socket.onopen = null;
      socket.onerror = null;

      try {
        socket.close();
      } catch {
        // Already closing.
      }

      reject(new Error("Unable to reach the veykor server."));
    }, socketOpenTimeoutMs);

    socket.onopen = () => {
      window.clearTimeout(timer);
      socket.onerror = null;
      resolve(socket);
    };

    socket.onerror = () => {
      window.clearTimeout(timer);
      socket.onopen = null;
      socket.onerror = null;
      reject(new Error("Unable to reach the veykor server."));
    };
  });
}

export async function startTranscription(
  events: TranscriptionEvents,
): Promise<ActiveTranscription> {
  if (
    typeof navigator === "undefined" ||
    navigator.mediaDevices === undefined ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    throw new Error(
      "The microphone is unavailable here. Voice input needs localhost or HTTPS.",
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  function stopTracks(): void {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }

  let socket: WebSocket;

  try {
    socket = await openSocket();
  } catch (cause) {
    stopTracks();
    throw cause;
  }

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let capture: AudioWorkletNode | null = null;
  let silence: GainNode | null = null;

  function teardownAudio(): void {
    if (capture !== null) {
      capture.port.close();
      capture.disconnect();
      capture = null;
    }

    if (source !== null) {
      source.disconnect();
      source = null;
    }

    if (silence !== null) {
      silence.disconnect();
      silence = null;
    }

    if (context !== null) {
      const closing = context;

      context = null;
      void closing.close().catch(() => {});
    }

    stopTracks();
  }

  let transcript = "";
  let closedNotified = false;
  let stopPromise: Promise<string> | null = null;
  let resolveStop: ((text: string) => void) | null = null;
  let flushTimer: number | null = null;

  function notifyClosed(): void {
    if (closedNotified) {
      return;
    }

    closedNotified = true;
    events.onClosed();
  }

  function settleStop(text: string): void {
    if (resolveStop === null) {
      return;
    }

    const resolve = resolveStop;

    resolveStop = null;

    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }

    resolve(text);
  }

  function closeSocket(): void {
    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      try {
        socket.close();
      } catch {
        // Already closing.
      }
    }
  }

  function handleClosed(): void {
    teardownAudio();
    settleStop(transcript);
    notifyClosed();
  }

  function stop(): Promise<string> {
    if (stopPromise !== null) {
      return stopPromise;
    }

    stopPromise = new Promise<string>((resolve) => {
      resolveStop = resolve;

      teardownAudio();

      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: "end" }));
        } catch {
          // The socket is already closing.
        }
      }

      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        settleStop(transcript);
        closeSocket();
      }, flushTimeoutMs);
    });

    void stopPromise.then(() => {
      closeSocket();
    });

    return stopPromise;
  }

  function abort(): void {
    teardownAudio();
    settleStop(transcript);
    closeSocket();
    notifyClosed();
  }

  socket.onmessage = (event: MessageEvent) => {
    if (typeof event.data !== "string") {
      return;
    }

    const message = parseServerMessage(event.data);

    if (message === null) {
      return;
    }

    if (message.type === "ready") {
      events.onReady();

      return;
    }

    if (message.type === "transcript") {
      transcript = message.text;
      events.onTranscript(message.text, message.final);

      if (message.final) {
        settleStop(transcript);
      }

      return;
    }

    events.onError(message.message);
    handleClosed();
  };

  socket.onclose = () => {
    handleClosed();
  };

  socket.onerror = () => {
    // The close event follows with the teardown.
  };

  try {
    context = new AudioContext();

    if (context.state === "suspended") {
      await context.resume();
    }

    await context.audioWorklet.addModule(captureWorkletUrl);

    source = context.createMediaStreamSource(stream);

    capture = new AudioWorkletNode(context, "veykor-voice-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        sourceSampleRate: context.sampleRate,
        targetSampleRate: transcriptionSampleRate,
      },
    });

    silence = context.createGain();
    silence.gain.value = 0;

    capture.port.onmessage = (event: MessageEvent) => {
      if (
        socket.readyState === WebSocket.OPEN &&
        event.data instanceof ArrayBuffer
      ) {
        socket.send(event.data);
      }
    };

    source.connect(capture);
    capture.connect(silence);
    silence.connect(context.destination);
  } catch {
    teardownAudio();
    closeSocket();
    throw new Error("Voice capture failed to start in this browser.");
  }

  return { stop, abort };
}
