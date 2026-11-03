import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import {
  transcriptionPaths,
  transcriptionSocketCloseFailed,
} from "@veykor/shared";
import type { TranscriptionServerMessage } from "@veykor/shared";
import { findSessionAuth, sessionTokenFromCookieHeader } from "../auth/auth.js";
import {
  loadTranscriptionConfig,
  transcriptionRealtimeUrlWithSession,
} from "./transcription-config.js";
import { startTranscriptionRelay } from "./transcription-relay.js";

export const transcriptionMaxPayloadBytes = 256 * 1024;

export function isTranscriptionUpgradePath(url: string | undefined): boolean {
  if (url === undefined || url === "") {
    return false;
  }

  return url.split("?")[0] === transcriptionPaths.stream;
}

export function isAllowedTranscriptionOrigin(
  origin: string | undefined,
  host: string | undefined,
): boolean {
  if (origin === undefined || origin === "") {
    return true;
  }

  if (host === undefined || host === "") {
    return false;
  }

  let parsed: URL;

  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  return parsed.host === host;
}

function rejectUpgrade(socket: Socket, status: string): void {
  socket.write(
    `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

function sendUpgradeError(downstream: WebSocket, message: string): void {
  downstream.on("error", () => {});

  const payload: TranscriptionServerMessage = { type: "error", message };

  try {
    downstream.send(JSON.stringify(payload));
  } catch {
    // The browser is gone; closing below releases the socket.
  }

  try {
    downstream.close(transcriptionSocketCloseFailed);
  } catch {
    // Already closing.
  }
}

export function handleTranscriptionUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  sockets: WebSocketServer,
): void {
  if (!isAllowedTranscriptionOrigin(req.headers.origin, req.headers.host)) {
    rejectUpgrade(socket, "403 Forbidden");

    return;
  }

  const token = sessionTokenFromCookieHeader(req.headers.cookie);

  if (findSessionAuth(token) === null) {
    rejectUpgrade(socket, "401 Unauthorized");

    return;
  }

  const config = loadTranscriptionConfig();

  sockets.handleUpgrade(req, socket, head, (downstream) => {
    if (config.apiKey === "") {
      sendUpgradeError(
        downstream,
        "Voice transcription is not configured on the server.",
      );

      return;
    }

    let upstream: WebSocket;

    try {
      upstream = new WebSocket(
        transcriptionRealtimeUrlWithSession(config.realtimeUrl, randomUUID()),
      );
    } catch {
      sendUpgradeError(
        downstream,
        "Unable to reach the transcription service. Try again.",
      );

      return;
    }

    startTranscriptionRelay({
      downstream,
      upstream,
      apiKey: config.apiKey,
      model: config.model,
    });
  });
}
