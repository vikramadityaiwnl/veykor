import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { TranscribeServerFrame } from "@veykor/shared";
import { asrWebSocketUrl } from "../auth/config.js";
import { closeMessage, handshakeFrame, mapServerEvent } from "./protocol.js";

const connectTimeoutMs = 15_000;
const handshakeTimeoutMs = 15_000;
const drainTimeoutMs = 20_000;

function parseJson(data: unknown): unknown {
  if (typeof data !== "string" && !Buffer.isBuffer(data)) {
    return undefined;
  }

  try {
    return JSON.parse(data.toString());
  } catch {
    return undefined;
  }
}

export function startRelay(client: WebSocket, apiKey: string): void {
  let meta: WebSocket | undefined;
  let acknowledged = false;
  let clientEnded = false;
  let finished = false;
  let connectTimer: NodeJS.Timeout | undefined;
  let handshakeTimer: NodeJS.Timeout | undefined;
  let drainTimer: NodeJS.Timeout | undefined;

  function clearTimers() {
    clearTimeout(connectTimer);
    clearTimeout(handshakeTimer);
    clearTimeout(drainTimer);
  }

  function send(frame: TranscribeServerFrame) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(frame));
      } catch {
        finish(1011);
      }
    }
  }

  function finish(code: number, frame?: TranscribeServerFrame) {
    if (finished) {
      return;
    }

    finished = true;
    clearTimers();

    if (frame && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(frame));
      } catch {
        // The socket is already unusable; closing below is enough.
      }
    }

    try {
      if (client.readyState === WebSocket.OPEN) {
        client.close(code);
      }
    } catch {
      // The socket is already unusable.
    }

    try {
      meta?.terminate();
    } catch {
      // The socket is already unusable.
    }
  }

  function failStart() {
    finish(1011, {
      type: "error",
      message: "Transcription failed to start. Please try again.",
    });
  }

  try {
    const url = new URL(asrWebSocketUrl());

    url.searchParams.set("sessionId", `stream-${randomUUID()}`);
    meta = new WebSocket(url.toString(), {
      handshakeTimeout: connectTimeoutMs,
    });
  } catch {
    failStart();
    return;
  }

  connectTimer = setTimeout(() => {
    if (!acknowledged) {
      failStart();
    }
  }, connectTimeoutMs + handshakeTimeoutMs);

  meta.on("open", () => {
    try {
      meta?.send(handshakeFrame(apiKey));
    } catch {
      failStart();
      return;
    }

    handshakeTimer = setTimeout(() => {
      if (!acknowledged) {
        failStart();
      }
    }, handshakeTimeoutMs);
  });

  meta.on("message", (data, isBinary) => {
    if (finished || isBinary) {
      return;
    }

    const raw = parseJson(
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
          ? data
          : undefined,
    );

    if (!acknowledged) {
      if (
        raw &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        !("type" in raw) &&
        typeof (raw as { sessionId?: unknown }).sessionId === "string"
      ) {
        acknowledged = true;
        clearTimeout(connectTimer);
        clearTimeout(handshakeTimer);
        send({ type: "ready" });
      } else {
        const event = mapServerEvent(raw);

        if (event.kind === "error") {
          finish(1011, { type: "error", message: event.message });
        } else {
          failStart();
        }
      }

      return;
    }

    const event = mapServerEvent(raw);

    if (event.kind === "partial") {
      send({ type: "partial", text: event.text });
    } else if (event.kind === "complete") {
      send({ type: "final", text: event.text, turnId: event.turnId });
    } else if (event.kind === "error") {
      send({ type: "error", message: event.message });
    }
  });

  meta.on("close", (code, reason) => {
    if (finished) {
      return;
    }

    if (!acknowledged) {
      failStart();
      return;
    }

    const message = closeMessage(code, reason.toString());

    finish(
      message ? 1011 : 1000,
      message ? { type: "error", message } : undefined,
    );
  });

  meta.on("error", () => {
    if (!acknowledged) {
      failStart();
    }
  });

  client.on("message", (data, isBinary) => {
    if (finished) {
      return;
    }

    if (isBinary) {
      if (!clientEnded && meta?.readyState === WebSocket.OPEN) {
        try {
          meta.send(data, { binary: true });
        } catch {
          finish(1011, {
            type: "error",
            message: "Transcription failed. Please try again.",
          });
        }
      }

      return;
    }

    const raw = parseJson(
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
          ? data
          : undefined,
    );

    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      (raw as { type?: unknown }).type === "end"
    ) {
      clientEnded = true;

      if (meta?.readyState === WebSocket.OPEN) {
        try {
          meta.send(JSON.stringify({ type: "endStream" }));
        } catch {
          finish(1000);
          return;
        }
      }

      drainTimer = setTimeout(() => finish(1000), drainTimeoutMs);
    }
  });

  client.on("close", () => finish(1000));
  client.on("error", () => finish(1000));
}
