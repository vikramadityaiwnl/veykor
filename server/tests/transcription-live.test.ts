import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { TranscribeServerFrame, TranscriptionCatalogResponse } from "@veykor/shared";

interface Spawned {
  child: ChildProcess;
  origin: string;
  folder: string;
}

async function spawnServer(
  port: string,
  env: Record<string, string>,
): Promise<Spawned> {
  const folder = mkdtempSync(join(tmpdir(), "veykor-transcribe-live-"));
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      JWT_SECRET: "transcribe-live-test-secret-thirty-two-bytes!",
      PORT: port,
      DATABASE_URL: join(folder, "test.db"),
      AUTH_COOKIE_SECURE: "false",
      AUTH_ORIGINS: origin,
      ...env,
    },
    stdio: "pipe",
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server startup timeout")),
      10_000,
    );
    child.stdout!.on("data", (data) => {
      if (String(data).includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr!.on("data", (data) => {
      clearTimeout(timer);
      reject(new Error(String(data)));
    });
  });

  return { child, origin, folder };
}

async function stopServer(server: Spawned) {
  await new Promise<void>((resolve) => {
    server.child.once("exit", () => resolve());
    server.child.kill();
  });
  rmSync(server.folder, { recursive: true, force: true });
}

function request(
  origin: string,
  path: string,
  cookie: string,
  body: unknown,
  method: string,
) {
  return fetch(`${origin}/api/${path}`, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-Veykor-Request": "1",
    },
    body: JSON.stringify(body),
  });
}

async function register(origin: string, username: string): Promise<string> {
  const response = await request(
    origin,
    "auth/register",
    "",
    { username, password: "a-long-test-password" },
    "POST",
  );

  assert.equal(response.status, 200);

  return response.headers.get("set-cookie")!.split(";")[0];
}

function collect(
  socket: WebSocket,
  count: number,
  timeoutMs = 10_000,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const frames: string[] = [];
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for frames")),
      timeoutMs,
    );

    socket.on("message", (data) => {
      frames.push(data.toString());

      if (frames.length >= count) {
        clearTimeout(timer);
        resolve(frames);
      }
    });
    socket.on("error", reject);
  });
}

test("live transcription relays audio and transcripts between browser and Meta", async () => {
  const mock = new WebSocketServer({ port: 0 });

  await new Promise<void>((resolve) => mock.on("listening", resolve));

  const address = mock.address();

  assert.equal(typeof address, "object");

  const server = await spawnServer("31991", {
    META_ASR_WS_URL: `ws://localhost:${(address as { port: number }).port}/v1/asr/realtime`,
  });

  const handshakes: string[] = [];
  const audio: Buffer[] = [];
  const ended: string[] = [];

  mock.on("connection", (upstream) => {
    let first = true;

    upstream.on("message", (data, isBinary) => {
      if (isBinary) {
        audio.push(Buffer.from(data as Buffer));
        return;
      }

      if (first) {
        first = false;
        handshakes.push(data.toString());
        upstream.send(JSON.stringify({ sessionId: "mock-session" }));
        return;
      }

      ended.push(data.toString());
    });
  });

  try {
    const cookie = await register(server.origin, "transcribe-live-owner");
    const stored = await request(
      server.origin,
      "settings/transcription-key",
      cookie,
      { key: "live-test-model-key" },
      "PUT",
    );
    assert.equal(stored.status, 200);
    const socket = new WebSocket(`${server.origin}/api/transcribe/live`, {
      headers: { Cookie: cookie, Origin: server.origin },
    });

    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });

    const ready = await collect(socket, 1);
    assert.deepEqual(JSON.parse(ready[0]), { type: "ready" });
    assert.equal(handshakes.length, 1);
    assert.deepEqual(JSON.parse(handshakes[0]), {
      authorization: { accessToken: "Bearer live-test-model-key" },
      audioEncoding: "PCM_24KHZ",
      model: "muse-voice-transcribe-1.0",
      mode: "ENDPOINTING",
      emitAudioProgress: false,
    });

    const pcm = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    socket.send(pcm);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for audio")),
        10_000,
      );
      const check = setInterval(() => {
        if (audio.length > 0) {
          clearTimeout(timer);
          clearInterval(check);
          resolve();
        }
      }, 10);
    });
    assert.deepEqual(audio[0], pcm);

    const upstream = [...mock.clients][0]!;
    const incoming = collect(socket, 2);

    upstream.send(
      JSON.stringify({
        type: "transcript",
        transcript: "hello",
        final: false,
        audioProcessedMs: 800,
      }),
    );
    upstream.send(
      JSON.stringify({
        type: "speechComplete",
        turnId: 1,
        transcript: "hello there.",
        audioProcessedMs: 1600,
      }),
    );

    const frames = (await incoming).map(
      (frame) => JSON.parse(frame) as TranscribeServerFrame,
    );
    assert.deepEqual(frames, [
      { type: "partial", text: "hello" },
      { type: "final", text: "hello there.", turnId: 1 },
    ]);

    const closed = new Promise<number>((resolve) => {
      socket.on("close", (code) => resolve(code));
    });

    socket.send(JSON.stringify({ type: "end" }));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for endStream")),
        10_000,
      );
      const check = setInterval(() => {
        if (ended.length > 0) {
          clearTimeout(timer);
          clearInterval(check);
          resolve();
        }
      }, 10);
    });
    assert.deepEqual(JSON.parse(ended[0]), { type: "endStream" });

    upstream.close(1000);
    assert.equal(await closed, 1000);
  } finally {
    for (const client of mock.clients) {
      client.terminate();
    }

    await new Promise<void>((resolve) => mock.close(() => resolve()));
    await stopServer(server);
  }
});

test("live transcription rejects unauthenticated, cross-origin, and unconfigured upgrades", async () => {
  const server = await spawnServer("31992", {});

  try {
    const cookie = await register(server.origin, "transcribe-live-guest");
    const stored = await request(
      server.origin,
      "settings/transcription-key",
      cookie,
      { key: "live-test-model-key" },
      "PUT",
    );
    assert.equal(stored.status, 200);

    async function upgradeStatus(headers: Record<string, string>) {
      const socket = new WebSocket(`${server.origin}/api/transcribe/live`, {
        headers,
      });

      try {
        return await new Promise<number>((resolve) => {
          socket.on("open", () => resolve(200));
          socket.on("unexpected-response", (_request, response) =>
            resolve(response.statusCode || 0),
          );
          socket.on("error", () => resolve(0));
        });
      } finally {
        socket.terminate();
      }
    }

    assert.equal(await upgradeStatus({ Origin: server.origin }), 401);
    assert.equal(
      await upgradeStatus({
        Cookie: "veykor_session=forged",
        Origin: server.origin,
      }),
      401,
    );
    assert.equal(
      await upgradeStatus({ Cookie: cookie, Origin: "http://evil.test" }),
      403,
    );
    assert.equal(
      await upgradeStatus({ Cookie: cookie, Origin: server.origin }),
      200,
    );
  } finally {
    await stopServer(server);
  }

  const unconfigured = await spawnServer("31993", {});

  try {
    const cookie = await register(unconfigured.origin, "transcribe-live-nokey");
    const socket = new WebSocket(`${unconfigured.origin}/api/transcribe/live`, {
      headers: { Cookie: cookie, Origin: unconfigured.origin },
    });

    try {
      const status = await new Promise<number>((resolve) => {
        socket.on("open", () => resolve(200));
        socket.on("unexpected-response", (_request, response) =>
          resolve(response.statusCode || 0),
        );
        socket.on("error", () => resolve(0));
      });

      assert.equal(status, 503);
    } finally {
      socket.terminate();
    }

    const catalog = (await (
      await fetch(`${unconfigured.origin}/api/settings/transcription-catalog`, {
        headers: { Cookie: cookie },
      })
    ).json()) as TranscriptionCatalogResponse;

    assert.equal(catalog.providers[0]?.available, false);
    assert.deepEqual(catalog.providers[0]?.models, []);
  } finally {
    await stopServer(unconfigured);
  }
});
