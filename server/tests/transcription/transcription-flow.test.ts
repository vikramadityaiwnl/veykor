import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  authPaths,
  transcriptionPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31991";

const unconfiguredPort = "31992";

const baseUrl = `http://localhost:${testPort}`;

const unconfiguredUrl = `http://localhost:${unconfiguredPort}`;

function startServer(
  port: string,
  database: string,
  extraEnv: Record<string, string>,
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: serverDir,
      env: {
        ...process.env,
        PORT: port,
        DATABASE_URL: database,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timeout: ${stderr}`));
    }, 20000);

    child.stdout?.on("data", (data) => {
      if (String(data).includes("listening")) {
        clearTimeout(timer);
        resolve(child);
      }
    });

    child.stderr?.on("data", (data) => {
      stderr += String(data);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function stopServer(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}

async function registerCookie(
  origin: string,
  username: string,
): Promise<string> {
  const response = await fetch(origin + authPaths.register, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [veykorRequestHeaderName]: veykorRequestHeaderValue,
    },
    body: JSON.stringify({ username, password: "a-strong-test-password" }),
  });

  assert.equal(response.status, 201);

  const rawCookie = response.headers.get("set-cookie") ?? "";

  return rawCookie.split(";")[0] ?? "";
}

class MockMeta {
  handshakes: Array<Record<string, unknown>> = [];

  audioChunks: Array<Buffer> = [];

  endStreams = 0;

  onHandshake:
    ((socket: WebSocket, handshake: Record<string, unknown>) => void) | null =
    null;

  audioHook: ((socket: WebSocket) => void) | null = null;

  private wss: WebSocketServer;

  url: string;

  private constructor(wss: WebSocketServer, url: string) {
    this.wss = wss;
    this.url = url;

    wss.on("connection", (socket) => {
      let handshake: Record<string, unknown> | null = null;

      socket.on("message", (data, isBinary) => {
        if (isBinary) {
          this.audioChunks.push(Buffer.from(data as Buffer));

          if (this.audioHook !== null) {
            const hook = this.audioHook;

            this.audioHook = null;
            hook(socket);
          }

          return;
        }

        const parsed = JSON.parse(String(data)) as Record<string, unknown>;

        if (handshake === null) {
          handshake = parsed;
          this.handshakes.push(parsed);

          if (this.onHandshake !== null) {
            this.onHandshake(socket, parsed);

            return;
          }

          socket.send(JSON.stringify({ sessionId: "mock-session" }));

          return;
        }

        if (parsed.type === "endStream") {
          this.endStreams += 1;
          socket.send(
            JSON.stringify({
              type: "transcript",
              transcript: "hello there",
              final: true,
            }),
          );
          socket.close(1000);
        }
      });
    });
  }

  static async start(): Promise<MockMeta> {
    const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });

    await new Promise<void>((resolve) => {
      wss.on("listening", () => resolve());
    });

    const address = wss.address();

    assert.notEqual(address, null);
    assert.notEqual(typeof address, "string");

    const port = (address as { port: number }).port;

    return new MockMeta(wss, `ws://127.0.0.1:${port}/v1/asr/realtime`);
  }

  async stop(): Promise<void> {
    for (const socket of this.wss.clients) {
      socket.terminate();
    }

    await new Promise<void>((resolve, reject) => {
      this.wss.close((cause) => {
        if (cause) {
          reject(cause);
        } else {
          resolve();
        }
      });
    });
  }
}

interface ClientCapture {
  socket: WebSocket;
  frames: Array<string>;
  closeCode: number | null;
}

async function connectClient(
  origin: string,
  headers: Record<string, string>,
): Promise<ClientCapture> {
  const url = origin.replace("http", "ws") + transcriptionPaths.stream;
  const capture: ClientCapture = {
    socket: new WebSocket(url, { headers }),
    frames: [],
    closeCode: null,
  };

  capture.socket.on("message", (data) => {
    capture.frames.push(String(data));
  });

  capture.socket.on("close", (code) => {
    capture.closeCode = code;
  });

  await new Promise<void>((resolve, reject) => {
    capture.socket.once("open", () => resolve());
    capture.socket.once("error", (cause) => reject(cause));
  });

  return capture;
}

async function waitFor(
  label: string,
  ready: () => boolean,
  timeoutMs = 10000,
): Promise<void> {
  const started = Date.now();

  while (!ready()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for ${label}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

test("transcription relays live audio and streams transcripts back", async () => {
  const mock = await MockMeta.start();
  const folder = mkdtempSync(join(tmpdir(), "veykor-transcription-"));

  let child: ChildProcess | null = null;
  let client: ClientCapture | null = null;

  try {
    child = await startServer(testPort, join(folder, "test.db"), {
      MODEL_API_KEY: "test-meta-key",
      ASR_REALTIME_URL: mock.url,
    });

    const cookie = await registerCookie(baseUrl, "transcriber");

    assert.notEqual(cookie, "");

    client = await connectClient(baseUrl, {
      Cookie: cookie,
      Origin: baseUrl,
    });

    await waitFor("ready frame", () => client?.frames.length === 1);

    assert.deepEqual(JSON.parse(client.frames[0]), {
      type: "ready",
      sessionId: "mock-session",
    });

    await waitFor("upstream handshake", () => mock.handshakes.length === 1);

    assert.deepEqual(mock.handshakes[0], {
      authorization: { accessToken: "Bearer test-meta-key" },
      audioEncoding: "PCM_24KHZ",
      model: "muse-voice-transcribe-1.0",
      mode: "PUSH_TO_TALK",
      partialMode: "CUMULATIVE",
      emitAudioProgress: false,
    });

    client.socket.send(Buffer.from([10, 20, 30, 40]));

    await waitFor("upstream audio", () => mock.audioChunks.length === 1);

    assert.deepEqual(Array.from(mock.audioChunks[0]), [10, 20, 30, 40]);

    client.socket.send(JSON.stringify({ type: "end" }));

    await waitFor(
      "final transcript",
      () => client?.frames.length === 2 && client.closeCode === 1000,
    );

    assert.deepEqual(JSON.parse(client.frames[1]), {
      type: "transcript",
      text: "hello there",
      final: true,
    });
    assert.equal(mock.endStreams, 1);
  } finally {
    client?.socket.terminate();

    if (child !== null) {
      await stopServer(child);
    }

    await mock.stop();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("transcription surfaces upstream failures to the browser", async () => {
  const mock = await MockMeta.start();
  const folder = mkdtempSync(join(tmpdir(), "veykor-transcription-"));

  let child: ChildProcess | null = null;
  let first: ClientCapture | null = null;
  let second: ClientCapture | null = null;

  try {
    child = await startServer(testPort, join(folder, "test.db"), {
      MODEL_API_KEY: "test-meta-key",
      ASR_REALTIME_URL: mock.url,
    });

    const cookie = await registerCookie(baseUrl, "transcriber-errors");

    mock.onHandshake = (socket) => {
      socket.send(
        JSON.stringify({
          type: "error",
          message: "invalid key",
          sessionId: "mock-session",
        }),
      );
      socket.close(1008);
    };

    first = await connectClient(baseUrl, { Cookie: cookie });

    await waitFor(
      "handshake failure",
      () => first?.frames.length === 1 && first.closeCode === 1011,
    );

    assert.deepEqual(JSON.parse(first.frames[0]), {
      type: "error",
      message: "invalid key",
    });

    mock.onHandshake = null;
    mock.audioHook = (socket) => {
      socket.send(
        JSON.stringify({
          type: "error",
          message: "backend exploded",
          sessionId: "mock-session",
        }),
      );
      socket.close(1011);
    };

    second = await connectClient(baseUrl, { Cookie: cookie });

    await waitFor("ready frame", () => second?.frames.length === 1);

    second.socket.send(Buffer.from([1, 2]));

    await waitFor(
      "mid-stream failure",
      () => second?.frames.length === 2 && second.closeCode === 1011,
    );

    assert.deepEqual(JSON.parse(second.frames[1]), {
      type: "error",
      message: "backend exploded",
    });
  } finally {
    first?.socket.terminate();
    second?.socket.terminate();

    if (child !== null) {
      await stopServer(child);
    }

    await mock.stop();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("transcription rejects bad upgrades and missing configuration", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-transcription-"));

  let child: ChildProcess | null = null;
  let client: ClientCapture | null = null;

  try {
    child = await startServer(unconfiguredPort, join(folder, "test.db"), {
      MODEL_API_KEY: "",
    });

    const cookie = await registerCookie(unconfiguredUrl, "transcriber-guest");

    await assert.rejects(
      connectClient(unconfiguredUrl, {}),
      /Unexpected server response: 401/,
    );

    await assert.rejects(
      connectClient(unconfiguredUrl, {
        Cookie: cookie,
        Origin: "http://evil.example",
      }),
      /Unexpected server response: 403/,
    );

    client = await connectClient(unconfiguredUrl, { Cookie: cookie });

    await waitFor(
      "missing key error",
      () => client?.frames.length === 1 && client.closeCode === 1011,
    );

    assert.deepEqual(JSON.parse(client.frames[0]), {
      type: "error",
      message: "Voice transcription is not configured on the server.",
    });
  } finally {
    client?.socket.terminate();

    if (child !== null) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});
