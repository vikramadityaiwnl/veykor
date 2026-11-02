import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptionCatalogResponse, TranscriptionDefaults, TranscriptionKeyStatus } from "@veykor/shared";

test("transcription settings persist per user and reject invalid payloads", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-transcription-"));
  const port = "31990";
  const origin = `http://localhost:${port}`;
  let child: ChildProcess;
  child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      JWT_SECRET: "transcription-test-secret-thirty-two-bytes!!",
      PORT: port,
      DATABASE_URL: join(folder, "test.db"),
      AUTH_COOKIE_SECURE: "false",
      AUTH_ORIGINS: origin,
    },
    stdio: "pipe",
  });

  async function request(
    path: string,
    cookie = "",
    body?: unknown,
    method = body === undefined ? "GET" : "PUT",
  ) {
    return fetch(`${origin}/api/${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-Veykor-Request": "1",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  try {
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

    assert.equal(
      (await request("settings/transcription-defaults")).status,
      401,
    );
    assert.equal((await request("settings/transcription-catalog")).status, 401);
    assert.equal((await request("settings/transcription-key")).status, 401);

    const registered = await request(
      "auth/register",
      "",
      { username: "transcribe-owner", password: "a-long-test-password" },
      "POST",
    );
    assert.equal(registered.status, 200);
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];

    const initial = (await (
      await request("settings/transcription-defaults", cookie)
    ).json()) as TranscriptionDefaults;
    assert.deepEqual(initial, { providerId: "", modelId: "" });

    assert.equal(
      (
        await request("settings/transcription-defaults", cookie, {
          providerId: "invented",
          modelId: "muse-voice-transcribe-1.0",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("settings/transcription-defaults", cookie, {
          providerId: "muse",
          modelId: "--flag",
        })
      ).status,
      400,
    );

    const saved = await request("settings/transcription-defaults", cookie, {
      providerId: "muse",
      modelId: "muse-voice-transcribe-1.0",
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), {
      providerId: "muse",
      modelId: "muse-voice-transcribe-1.0",
    });

    const reloaded = (await (
      await request("settings/transcription-defaults", cookie)
    ).json()) as TranscriptionDefaults;
    assert.deepEqual(reloaded, {
      providerId: "muse",
      modelId: "muse-voice-transcribe-1.0",
    });

    const locked = (await (
      await request("settings/transcription-catalog", cookie)
    ).json()) as TranscriptionCatalogResponse;
    assert.equal(Array.isArray(locked.providers), true);
    assert.equal(locked.providers[0]?.id, "muse");
    assert.equal(locked.providers[0]?.available, false);
    assert.deepEqual(locked.providers[0]?.models, []);

    const unconfigured = (await (
      await request("settings/transcription-key", cookie)
    ).json()) as TranscriptionKeyStatus;
    assert.deepEqual(unconfigured, { configured: false, preview: "" });

    assert.equal(
      (await request("settings/transcription-key", cookie, { key: 42 })).status,
      400,
    );
    assert.equal(
      (
        await request("settings/transcription-key", cookie, {
          key: "x".repeat(501),
        })
      ).status,
      400,
    );

    const stored = await request("settings/transcription-key", cookie, {
      key: "test-model-key-for-transcription",
    });
    assert.equal(stored.status, 200);

    const storedBody = (await stored.json()) as TranscriptionKeyStatus;
    assert.deepEqual(storedBody, {
      configured: true,
      preview: "test…tion",
    });
    assert.equal(JSON.stringify(storedBody).includes("test-model-key"), false);

    const configured = (await (
      await request("settings/transcription-key", cookie)
    ).json()) as TranscriptionKeyStatus;
    assert.deepEqual(configured, {
      configured: true,
      preview: "test…tion",
    });

    const catalog = (await (
      await request("settings/transcription-catalog", cookie)
    ).json()) as TranscriptionCatalogResponse;
    assert.equal(catalog.providers[0]?.available, true);
    assert.deepEqual(catalog.providers[0]?.models, [
      {
        id: "muse-voice-transcribe-1.0",
        name: "Muse Voice Transcribe",
        description:
          "Meta's speech-to-text model with live partial transcripts.",
      },
    ]);

    const cleared = await request("settings/transcription-key", cookie, {
      key: "",
    });
    assert.equal(cleared.status, 200);
    assert.deepEqual(await cleared.json(), {
      configured: false,
      preview: "",
    });

    const relocked = (await (
      await request("settings/transcription-catalog", cookie)
    ).json()) as TranscriptionCatalogResponse;
    assert.equal(relocked.providers[0]?.available, false);
    assert.deepEqual(relocked.providers[0]?.models, []);
  } finally {
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
    rmSync(folder, { recursive: true, force: true });
  }
});
