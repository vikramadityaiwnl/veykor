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

const testPort = "31990";

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

test("chat listing links to a Muse session", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-chats-"));
  const database = join(folder, "test.db");

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    const registered = await request(authPaths.register, {
      body: { username: "chats", password: "a-strong-test-password" },
    });

    assert.equal(registered.status, 201);

    const cookie = registered.cookie;

    assert.notEqual(cookie, "");

    assert.equal((await request(chatPaths.chats)).status, 401);

    const empty = await request(chatPaths.chats, { cookie });

    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, []);

    const created = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(created.status, 201);

    const detail = created.body as {
      chat: { id: string; museSessionId: string; sectionId: string };
      items: Array<unknown>;
      pendingApprovals: Array<unknown>;
    };

    assert.notEqual(detail.chat.id, "");
    assert.notEqual(detail.chat.museSessionId, "");
    assert.equal(detail.chat.sectionId, "recent");
    assert.deepEqual(detail.items, []);
    assert.deepEqual(detail.pendingApprovals, []);

    const chatId = detail.chat.id;

    const listed = (await request(chatPaths.chats, { cookie }))
      .body as unknown as Array<{
      id: string;
      museSessionId: string;
    }>;

    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, chatId);

    const models = await request(chatPaths.models, { cookie });

    assert.equal(models.status, 200);
    assert.ok(Array.isArray(models.body["models"]));

    const renamed = await request(chatPaths.chat(chatId), {
      method: "PATCH",
      cookie,
      body: { title: "Renamed", sectionId: "chats" },
    });

    assert.equal(renamed.status, 200);
    assert.equal(renamed.body["title"], "Renamed");
    assert.equal(renamed.body["sectionId"], "chats");

    const fetched = await request(chatPaths.chat(chatId), { cookie });

    assert.equal(fetched.status, 200);
    assert.ok(Array.isArray(fetched.body["items"]));

    const deleted = await request(chatPaths.chat(chatId), {
      method: "DELETE",
      cookie,
    });

    assert.equal(deleted.status, 200);

    const missing = await request(chatPaths.chat(chatId), { cookie });

    assert.equal(missing.status, 404);
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});
