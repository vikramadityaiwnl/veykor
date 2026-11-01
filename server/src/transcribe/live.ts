import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { eq } from "drizzle-orm";
import { WebSocketServer } from "ws";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { authConfig } from "../auth/config.js";
import { sessionCookieName, verifySessionToken } from "../auth/auth.js";
import { startRelay } from "./relay.js";

export const transcribeLivePath = "/api/transcribe/live";

const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });

function reject(socket: Socket, status: number, message: string) {
  const body = JSON.stringify({ error: message });

  socket.write(
    `HTTP/1.1 ${status} ${message}\r\n` +
      "Content-Type: application/json\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "Connection: close\r\n\r\n" +
      body,
  );
  socket.destroy();
}

function validOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;

  if (!origin) {
    return false;
  }

  if (authConfig.origins.includes(origin)) {
    return true;
  }

  const host = request.headers.host;

  if (!host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function requestCookie(request: IncomingMessage): string {
  const header = request.headers.cookie || "";

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (name === sessionCookieName) {
      return rest.join("=").trim();
    }
  }

  return "";
}

export function isTranscribeUpgrade(request: IncomingMessage): boolean {
  try {
    return (
      new URL(request.url || "", "http://local").pathname === transcribeLivePath
    );
  } catch {
    return false;
  }
}

export function handleTranscribeUpgrade(
  request: IncomingMessage,
  socket: Socket,
  head: Buffer,
): void {
  if (!validOrigin(request)) {
    reject(socket, 403, "Invalid request origin");
    return;
  }

  const token = requestCookie(request);

  if (!token) {
    reject(socket, 401, "Authentication required");
    return;
  }

  void verifySessionToken(token).then((session) => {
    if (socket.destroyed) {
      return;
    }

    if (!session) {
      reject(socket, 401, "Authentication required");
      return;
    }

    const user = db
      .select({ transcriptionApiKey: users.transcriptionApiKey })
      .from(users)
      .where(eq(users.id, session.user.id))
      .get();

    if (!user || user.transcriptionApiKey === "") {
      reject(socket, 503, "Transcription is not configured");
      return;
    }

    const apiKey = user.transcriptionApiKey;

    wss.handleUpgrade(request, socket, head, (client) => {
      startRelay(client, apiKey);
    });
  });
}
