import { useEffect, useRef, useState } from "react";
import type { SettingsProvider, TranscribeServerFrame, TranscriptionProvider } from "@veykor/shared";
import { useSettingsStore } from "../settings/settings-store";
import { useTranscriptionDefaultsStore } from "../settings/transcription-defaults-store";

export type TranscribeStatus = "idle" | "starting" | "recording" | "stopping";

export interface TranscribeError {
  title: string;
  description: string;
}

export interface TranscribeSelection {
  providerId: string;
  modelId: string;
}

interface Callbacks {
  onStart: () => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
}

interface Session {
  id: number;
  ready: boolean;
  socket: WebSocket | null;
  stream: MediaStream | null;
  context: AudioContext | null;
  source: MediaStreamAudioSourceNode | null;
  node: AudioWorkletNode | null;
  workletUrl: string;
  readyTimer: number;
  closeTimer: number;
}

const targetSampleRate = 24000;
const readyTimeoutMs = 20_000;
const stopTimeoutMs = 8_000;
const maxBufferedBytes = targetSampleRate * 2 * 5;

const captureProcessor = `
class TranscribeCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.parts = [];
    this.buffered = 0;
  }

  process(inputs) {
    const channels = inputs[0] || [];

    if (channels.length === 0) {
      return true;
    }

    const first = channels[0];
    const second = channels[1];
    const mixed = new Float32Array(first.length);

    for (let i = 0; i < first.length; i++) {
      mixed[i] = second ? (first[i] + second[i]) / 2 : first[i];
    }

    this.parts.push(mixed);
    this.buffered += mixed.length;

    if (this.buffered >= 4096) {
      const out = new Float32Array(this.buffered);
      let offset = 0;

      for (const part of this.parts) {
        out.set(part, offset);
        offset += part.length;
      }

      this.parts = [];
      this.buffered = 0;
      this.port.postMessage(out, [out.buffer]);
    }

    return true;
  }
}

registerProcessor("veykor-transcribe-capture", TranscribeCapture);
`;

export function resolveTranscriptionSelection(
  catalog: TranscriptionProvider[],
  providers: SettingsProvider[],
  savedProviderId: string,
  savedModelId: string,
): TranscribeSelection {
  const available = providers.filter((entry) => entry.available);

  const providerId = available.some((entry) => entry.id === savedProviderId)
    ? savedProviderId
    : available[0]?.id || "";

  const models = catalog.find((entry) => entry.id === providerId)?.models || [];

  const modelId = models.some((entry) => entry.id === savedModelId)
    ? savedModelId
    : models[0]?.id || "";

  return { providerId, modelId };
}

export function appendTranscript(base: string, text: string): string {
  if (!text) {
    return base;
  }

  if (!base) {
    return text;
  }

  return base + (base.endsWith(" ") ? "" : " ") + text;
}

export function floatToPcm16(
  samples: Float32Array,
  fromRate: number,
  toRate = targetSampleRate,
): Int16Array {
  const length = Math.max(0, Math.floor((samples.length * toRate) / fromRate));
  const pcm = new Int16Array(length);

  for (let i = 0; i < length; i++) {
    const position = (i * fromRate) / toRate;
    const before = Math.floor(position);
    const after = Math.min(before + 1, samples.length - 1);
    const fraction = position - before;
    const sample = samples[before] * (1 - fraction) + samples[after] * fraction;
    const clamped = Math.max(-1, Math.min(1, sample));

    pcm[i] =
      clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  return pcm;
}

function noProviderError(): TranscribeError {
  return {
    title: "No transcription provider",
    description:
      "Add a provider that supports transcription to use voice input.",
  };
}

function stopAudio(current: Session) {
  try {
    current.node?.disconnect();
  } catch {
    // The audio graph is already torn down.
  }

  try {
    current.source?.disconnect();
  } catch {
    // The audio graph is already torn down.
  }

  current.node = null;
  current.source = null;

  if (current.context) {
    void current.context.close().catch(() => {});
    current.context = null;
  }

  for (const track of current.stream?.getTracks() || []) {
    track.stop();
  }

  current.stream = null;

  if (current.workletUrl) {
    URL.revokeObjectURL(current.workletUrl);
    current.workletUrl = "";
  }
}

function dispose(current: Session | null) {
  if (!current) {
    return;
  }

  window.clearTimeout(current.readyTimer);
  window.clearTimeout(current.closeTimer);
  stopAudio(current);

  try {
    if (
      current.socket &&
      current.socket.readyState !== WebSocket.CLOSED &&
      current.socket.readyState !== WebSocket.CLOSING
    ) {
      current.socket.close();
    }
  } catch {
    // The socket is already unusable.
  }
}

export function useTranscribeRecorder(callbacks: Callbacks) {
  const [status, setStatus] = useState<TranscribeStatus>("idle");
  const [error, setError] = useState<TranscribeError | null>(null);

  const session = useRef<Session | null>(null);
  const sessionId = useRef(0);
  const pending = useRef(false);
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  function finish(id: number, failed: TranscribeError | null) {
    const current = session.current;

    if (!current || current.id !== id) {
      return;
    }

    session.current = null;
    dispose(current);

    if (failed) {
      setError(failed);
    }

    setStatus("idle");
  }

  async function start() {
    if (session.current || pending.current) {
      return;
    }

    pending.current = true;

    try {
      await begin();
    } finally {
      pending.current = false;
    }
  }

  async function begin() {
    const id = ++sessionId.current;

    setError(null);
    setStatus("starting");

    const transcription = useTranscriptionDefaultsStore.getState();

    if (transcription.status !== "ready") {
      await transcription.load();
    }

    const settings = useSettingsStore.getState();

    if (settings.status !== "ready") {
      await settings.load();
    }

    if (id !== sessionId.current) {
      return;
    }

    const fresh = useTranscriptionDefaultsStore.getState();
    const selection = resolveTranscriptionSelection(
      fresh.providers,
      useSettingsStore.getState().providers,
      fresh.providerId,
      fresh.modelId,
    );

    if (!selection.providerId || !selection.modelId) {
      setError(noProviderError());
      setStatus("idle");
      return;
    }

    let permission: PermissionState | "unknown";

    try {
      permission = (
        await navigator.permissions.query({
          name: "microphone",
        })
      ).state;
    } catch {
      permission = "unknown";
    }

    if (id !== sessionId.current) {
      return;
    }

    if (permission === "denied") {
      setError({
        title: "Microphone is blocked",
        description:
          "Allow microphone access for this site in your browser settings, then try again.",
      });
      setStatus("idle");
      return;
    }

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (requestError) {
      if (id !== sessionId.current) {
        return;
      }

      if (
        requestError instanceof DOMException &&
        requestError.name === "NotAllowedError"
      ) {
        let next: PermissionState | "unknown";

        try {
          next = (
            await navigator.permissions.query({
              name: "microphone",
            })
          ).state;
        } catch {
          next = permission;
        }

        if (id !== sessionId.current) {
          return;
        }

        if (next === "denied") {
          setError({
            title: "Microphone is blocked",
            description:
              "Allow microphone access for this site in your browser settings, then try again.",
          });
        }

        setStatus("idle");
        return;
      }

      if (
        requestError instanceof DOMException &&
        (requestError.name === "NotFoundError" ||
          requestError.name === "OverconstrainedError")
      ) {
        setError({
          title: "No microphone found",
          description: "Connect a microphone and try again.",
        });
        setStatus("idle");
        return;
      }

      setError({
        title: "Microphone unavailable",
        description: "The browser could not start audio capture.",
      });
      setStatus("idle");
      return;
    }

    if (id !== sessionId.current) {
      for (const track of stream.getTracks()) {
        track.stop();
      }

      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/transcribe/live`,
    );

    const current: Session = {
      id,
      ready: false,
      socket,
      stream,
      context: null,
      source: null,
      node: null,
      workletUrl: "",
      readyTimer: 0,
      closeTimer: 0,
    };

    session.current = current;

    current.readyTimer = window.setTimeout(() => {
      finish(id, {
        title: "Transcription failed to start",
        description: "Please try again.",
      });
    }, readyTimeoutMs);

    socket.binaryType = "arraybuffer";

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      let frame: TranscribeServerFrame;

      try {
        frame = JSON.parse(event.data) as TranscribeServerFrame;
      } catch {
        return;
      }

      if (frame.type === "ready") {
        current.ready = true;
        window.clearTimeout(current.readyTimer);
        void beginCapture(current);
      } else if (frame.type === "partial") {
        callbacksRef.current.onPartial(frame.text);
      } else if (frame.type === "final") {
        callbacksRef.current.onFinal(frame.text);
      } else if (frame.type === "error") {
        finish(id, {
          title: "Transcription failed",
          description: frame.message,
        });
      }
    };

    socket.onclose = () => {
      const live = session.current;

      if (!live || live.id !== id) {
        return;
      }

      if (live.ready) {
        finish(id, null);
      } else {
        finish(id, {
          title: "Transcription failed to start",
          description: "Please try again.",
        });
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  async function beginCapture(current: Session) {
    if (session.current?.id !== current.id || !current.stream) {
      return;
    }

    try {
      const context = new AudioContext();
      const workletUrl = URL.createObjectURL(
        new Blob([captureProcessor], { type: "text/javascript" }),
      );

      current.context = context;
      current.workletUrl = workletUrl;

      await context.audioWorklet.addModule(workletUrl);

      if (session.current?.id !== current.id) {
        void context.close().catch(() => {});
        URL.revokeObjectURL(workletUrl);
        return;
      }

      const source = context.createMediaStreamSource(current.stream);
      const node = new AudioWorkletNode(context, "veykor-transcribe-capture");

      current.source = source;
      current.node = node;

      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const live = session.current;

        if (!live || live.id !== current.id || !live.socket) {
          return;
        }

        if (live.socket.readyState !== WebSocket.OPEN) {
          return;
        }

        if (live.socket.bufferedAmount > maxBufferedBytes) {
          return;
        }

        const pcm = floatToPcm16(event.data, context.sampleRate);

        if (pcm.length > 0) {
          live.socket.send(pcm.buffer as ArrayBuffer);
        }
      };

      const silence = context.createGain();

      silence.gain.value = 0;
      source.connect(node);
      node.connect(silence);
      silence.connect(context.destination);

      await context.resume();

      if (session.current?.id !== current.id) {
        try {
          node.disconnect();
        } catch {
          // The audio graph is already torn down.
        }

        void context.close().catch(() => {});
        URL.revokeObjectURL(workletUrl);
        return;
      }

      setStatus("recording");
      callbacksRef.current.onStart();
    } catch {
      finish(current.id, {
        title: "Microphone unavailable",
        description: "The browser could not start audio capture.",
      });
    }
  }

  function stop() {
    const current = session.current;

    if (!current || status !== "recording") {
      return;
    }

    setStatus("stopping");
    stopAudio(current);

    try {
      current.socket?.send(JSON.stringify({ type: "end" }));
    } catch {
      finish(current.id, null);
      return;
    }

    current.closeTimer = window.setTimeout(() => {
      finish(current.id, null);
    }, stopTimeoutMs);
  }

  function cancel() {
    const current = session.current;

    if (current) {
      sessionId.current++;
      session.current = null;
      dispose(current);
    }

    setStatus("idle");
  }

  function clearError() {
    setError(null);
  }

  useEffect(() => {
    const pending = session;

    return () => {
      if (pending.current) {
        const current = pending.current;

        pending.current = null;
        dispose(current);
      }
    };
  }, []);

  return { status, error, start, stop, cancel, clearError };
}
