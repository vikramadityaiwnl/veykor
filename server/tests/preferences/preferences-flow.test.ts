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
  defaultPreferences,
  preferencesPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type { UserPreferences } from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31988";

const baseUrl = `http://localhost:${testPort}`;

interface TestResponse {
  status: number;
  body: Record<string, unknown>;
}

async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    marker?: boolean;
  } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.marker === false
      ? {}
      : { [veykorRequestHeaderName]: veykorRequestHeaderValue }),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
  };

  const response = await fetch(baseUrl + path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
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

test("preferences default, update, and survive restart", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-preferences-"));
  const database = join(folder, "test.db");

  let child = await startServer(database);

  try {
    const anonymous = await request(preferencesPaths.preferences);

    assert.equal(anonymous.status, 401);

    const registered = await fetch(baseUrl + authPaths.register, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
      },
      body: JSON.stringify({
        username: "alex",
        password: "a-strong-test-password",
      }),
    });

    assert.equal(registered.status, 201);

    const cookie =
      (registered.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

    assert.notEqual(cookie, "");

    const initial = await request(preferencesPaths.preferences, { cookie });

    assert.equal(initial.status, 200);
    assert.deepEqual(initial.body, {
      ...defaultPreferences(),
      agentsSeeded: true,
    });

    const withoutMarker = await request(preferencesPaths.preferences, {
      method: "PUT",
      body: defaultPreferences(),
      cookie,
      marker: false,
    });

    assert.equal(withoutMarker.status, 403);

    const updated: UserPreferences = {
      lastTab: "work",
      projectAgents: { "project-1": "agent-1" },
      projectExpanded: { "project-1": false },
      workSections: [
        { id: "default-projects", title: "Default projects", open: true },
      ],
      sections: [
        { id: "recent", title: "Recent", open: true },
        { id: "ideas", title: "Ideas", open: true },
      ],
      chatSections: { "getting-started": "ideas" },
      chatTitles: { "getting-started": "Hello world" },
      customChats: [{ id: "draft-1", title: "Untitled chat" }],
      removedChatIds: [],
      preferredModels: {
        chat: { modelId: "muse-spark-1.3", providerId: "meta" },
        work: null,
      },
      preferredEfforts: {
        chat: { "meta:muse-spark-1.3": "medium" },
        work: {},
      },
      preferredPermission: "approved",
      interruptionBehavior: "steer",
      agentsSeeded: true,
    };

    const saved = await request(preferencesPaths.preferences, {
      method: "PUT",
      body: updated,
      cookie,
    });

    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body, updated);

    const reloaded = await request(preferencesPaths.preferences, { cookie });

    assert.equal(reloaded.status, 200);
    assert.deepEqual(reloaded.body, updated);

    const sanitized = await request(preferencesPaths.preferences, {
      method: "PUT",
      body: {
        lastTab: "evil",
        sections: [
          { id: "chats", title: "Chats", open: false },
          { id: "", title: "", open: "yes" },
          { id: "ok", open: true },
        ],
        chatSections: { "": "ok", valid: "", legacy: "chats" },
        chatTitles: { valid: "  Spaced out  ", "": "x", bad: 42 },
        customChats: [
          { id: "kept", title: "  Kept chat  " },
          { id: "", title: "dropped" },
        ],
        removedChatIds: ["", "gone"],
        interruptionBehavior: "evil",
      },
      cookie,
    });

    assert.equal(sanitized.status, 200);
    assert.deepEqual(sanitized.body, {
      lastTab: "chat",
      projectAgents: {},
      projectExpanded: {},
      sections: [
        { id: "recent", title: "Recent", open: true },
        { id: "ok", title: "Untitled section", open: true },
      ],
      workSections: [
        { id: "default-projects", title: "Default projects", open: true },
      ],
      chatSections: { legacy: "recent" },
      chatTitles: { valid: "Spaced out" },
      customChats: [{ id: "kept", title: "Kept chat" }],
      removedChatIds: ["gone"],
      preferredModels: { chat: null, work: null },
      preferredEfforts: { chat: {}, work: {} },
      preferredPermission: "read-only",
      interruptionBehavior: "queue",
      agentsSeeded: false,
    });

    await stopServer(child);
    child = await startServer(database);

    const afterRestart = await request(preferencesPaths.preferences, {
      cookie,
    });

    assert.equal(afterRestart.status, 200);
    assert.deepEqual(afterRestart.body, {
      ...(sanitized.body as Record<string, unknown>),
      agentsSeeded: true,
    });
  } finally {
    await stopServer(child);
    rmSync(folder, { recursive: true, force: true });
  }
});
