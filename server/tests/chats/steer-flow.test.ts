import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authPaths,
  chatPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31986";

const baseUrl = `http://localhost:${testPort}`;

interface TestResponse {
  status: number;
  body: Record<string, unknown>;
  cookie: string;
}

async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
  } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [veykorRequestHeaderName]: veykorRequestHeaderValue,
    ...(options.cookie ? { Cookie: options.cookie } : {}),
  };

  const response = await fetch(baseUrl + path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const rawCookie = response.headers.get("set-cookie") ?? "";

  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    cookie: rawCookie.split(";")[0] ?? "",
  };
}

function startServer(database: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: serverDir,
      env: {
        ...process.env,
        PORT: testPort,
        DATABASE_URL: database,
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

test("steer validates input before touching a turn", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-steer-"));
  const database = join(folder, "test.db");

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    const registered = await request(authPaths.register, {
      body: { username: "steer", password: "a-strong-test-password" },
    });

    assert.equal(registered.status, 201);

    const cookie = registered.cookie;

    assert.notEqual(cookie, "");

    const anonymous = await request(chatPaths.steer("missing"), {
      body: { text: "hello", expectedTurnId: "turn-1" },
    });

    assert.equal(anonymous.status, 401);

    const missingTurn = await request(chatPaths.steer("missing"), {
      cookie,
      body: { text: "hello" },
    });

    assert.equal(missingTurn.status, 400);

    const empty = await request(chatPaths.steer("missing"), {
      cookie,
      body: { text: "   ", expectedTurnId: "turn-1" },
    });

    assert.equal(empty.status, 400);

    const tooLong = await request(chatPaths.steer("missing"), {
      cookie,
      body: { text: "x".repeat(20001), expectedTurnId: "turn-1" },
    });

    assert.equal(tooLong.status, 400);

    const badImage = await request(chatPaths.steer("missing"), {
      cookie,
      body: {
        text: "",
        expectedTurnId: "turn-1",
        images: [{ mediaType: "image/png", base64Data: "" }],
      },
    });

    assert.equal(badImage.status, 400);

    const unknownChat = await request(chatPaths.steer("missing"), {
      cookie,
      body: { text: "hello", expectedTurnId: "turn-1" },
    });

    assert.equal(unknownChat.status, 404);
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});
