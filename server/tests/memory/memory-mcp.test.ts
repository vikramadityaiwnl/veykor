import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  authPaths,
  chatPaths,
  memoryPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31999";

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
    headers?: Record<string, string>;
  } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [veykorRequestHeaderName]: veykorRequestHeaderValue,
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...options.headers,
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

async function authedCookie(username: string): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [veykorRequestHeaderName]: veykorRequestHeaderValue,
  };

  const response = await fetch(baseUrl + authPaths.register, {
    method: "POST",
    headers,
    body: JSON.stringify({ username, password: "a-strong-test-password" }),
  });

  assert.equal(response.status, 201);

  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
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

function teamTokenFor(database: string, chatId: string): string {
  const sqlite = new Database(database, { readonly: true });

  try {
    const row = sqlite
      .prepare("SELECT team_token FROM chats WHERE id = ?")
      .get(chatId) as { team_token: string };

    return row.team_token;
  } finally {
    sqlite.close();
  }
}

async function mcpCall(
  chatId: string,
  token: string,
  method: string,
  params?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/api/team-mcp/${chatId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      [veykorRequestHeaderName]: veykorRequestHeaderValue,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

function toolText(body: Record<string, unknown>): string {
  const result = body["result"] as
    { content?: Array<{ text?: unknown }> } | undefined;

  const text = result?.content?.[0]?.text;

  return typeof text === "string" ? text : "";
}

function isToolError(body: Record<string, unknown>): boolean {
  const result = body["result"] as { isError?: unknown } | undefined;

  return result?.isError === true;
}

test("muse sessions save and retrieve memories through team tools", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-memory-mcp-"));
  const database = join(folder, "test.db");
  const projectFolder = join(folder, "memory-project");

  mkdirSync(projectFolder);

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    const cookie = await authedCookie("mcp-owner");

    const created = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(created.status, 201);

    const chat = created.body["chat"] as { id: string };

    assert.notEqual(chat.id, "");

    const token = teamTokenFor(database, chat.id);

    assert.notEqual(token, "");

    const listed = await mcpCall(chat.id, token, "tools/list");

    assert.equal(listed.status, 200);

    const tools = (
      (listed.body["result"] as { tools?: Array<{ name?: unknown }> })?.tools ??
      []
    ).map((entry) => entry.name);

    for (const name of [
      "memory_save",
      "memory_list",
      "memory_update",
      "memory_delete",
    ]) {
      assert.ok(tools.includes(name), `Muse tools include ${name}`);
    }

    const forbidden = await mcpCall(chat.id, "wrong-token", "tools/list");

    assert.equal(forbidden.status, 401);

    const saved = await mcpCall(chat.id, token, "tools/call", {
      name: "memory_save",
      arguments: {
        instruction: "Always sign off as Veykor Test Bot.",
        scope: "global",
        idempotencyKey: "mcp-turn-1:signoff",
      },
    });

    assert.equal(isToolError(saved.body), false);

    const parsed = JSON.parse(toolText(saved.body)) as {
      memory: { id: string; sourceChatId: string; origin: string };
      reused: boolean;
      receipt: { scope: string };
    };

    assert.equal(parsed.reused, false);
    assert.equal(parsed.memory.origin, "conversation");
    assert.equal(parsed.memory.sourceChatId, chat.id);
    assert.equal(parsed.receipt.scope, "global");

    const memoryId = parsed.memory.id;

    const retry = await mcpCall(chat.id, token, "tools/call", {
      name: "memory_save",
      arguments: {
        instruction: "Always sign off as Veykor Test Bot.",
        scope: "global",
        idempotencyKey: "mcp-turn-1:signoff",
      },
    });

    const reparsed = JSON.parse(toolText(retry.body)) as {
      memory: { id: string };
      reused: boolean;
    };

    assert.equal(reparsed.reused, true);
    assert.equal(reparsed.memory.id, memoryId);

    const rejected = await mcpCall(chat.id, token, "tools/call", {
      name: "memory_save",
      arguments: {
        instruction: "Project rule without a project.",
        scope: "project",
      },
    });

    assert.equal(isToolError(rejected.body), true);
    assert.match(toolText(rejected.body), /project chat/);

    const secret = await mcpCall(chat.id, token, "tools/call", {
      name: "memory_save",
      arguments: {
        instruction: "Remember api_key: sk-abcdef1234567890",
        scope: "global",
      },
    });

    assert.equal(isToolError(secret.body), true);
    assert.match(toolText(secret.body), /secret/i);

    const retrieved = await mcpCall(chat.id, token, "tools/call", {
      name: "memory_list",
      arguments: { query: "sign off" },
    });

    assert.equal(isToolError(retrieved.body), false);

    const memories = (
      JSON.parse(toolText(retrieved.body)) as {
        memories: Array<{ id: string; instruction: string }>;
      }
    ).memories;

    assert.ok(memories.some((entry) => entry.id === memoryId));

    const stored = await request(memoryPaths.memories, { cookie });

    assert.equal(stored.status, 200);
    assert.ok(
      (stored.body["memories"] as Array<{ id: string }>).some(
        (entry) => entry.id === memoryId,
      ),
    );

    const agent = await request("/api/agents", {
      cookie,
      body: { name: "Memory Agent" },
    });

    assert.equal(agent.status, 201);

    const project = await request("/api/projects", {
      cookie,
      body: { folder: projectFolder, agentIds: [agent.body["id"]] },
    });

    assert.equal(project.status, 201);

    const projectId = project.body["id"] as string;

    const projectChat = await request(chatPaths.chats, {
      cookie,
      body: { projectId, agentId: agent.body["id"] },
    });

    assert.equal(projectChat.status, 201);

    const projectChatId = (projectChat.body["chat"] as { id: string }).id;
    const projectToken = teamTokenFor(database, projectChatId);

    const projectSaved = await mcpCall(
      projectChatId,
      projectToken,
      "tools/call",
      {
        name: "memory_save",
        arguments: {
          instruction: "Use tabs in this project only.",
          scope: "project",
        },
      },
    );

    assert.equal(isToolError(projectSaved.body), false);

    const projectMemoryId = (
      JSON.parse(toolText(projectSaved.body)) as {
        memory: { id: string };
      }
    ).memory.id;

    const projectRetrieved = await mcpCall(
      projectChatId,
      projectToken,
      "tools/call",
      { name: "memory_list", arguments: {} },
    );

    const projectMemories = (
      JSON.parse(toolText(projectRetrieved.body)) as {
        memories: Array<{ id: string }>;
      }
    ).memories.map((entry) => entry.id);

    assert.ok(projectMemories.includes(projectMemoryId));
    assert.ok(projectMemories.includes(memoryId));

    const plainRetrieved = await mcpCall(chat.id, token, "tools/call", {
      name: "memory_list",
      arguments: {},
    });

    const plainMemories = (
      JSON.parse(toolText(plainRetrieved.body)) as {
        memories: Array<{ id: string }>;
      }
    ).memories.map((entry) => entry.id);

    assert.ok(!plainMemories.includes(projectMemoryId));
    assert.ok(plainMemories.includes(memoryId));

    const scopedOutside = await mcpCall(chat.id, token, "tools/call", {
      name: "memory_list",
      arguments: { scope: "project" },
    });

    assert.equal(isToolError(scopedOutside.body), false);
    assert.deepEqual(
      (JSON.parse(toolText(scopedOutside.body)) as { memories: unknown })
        .memories,
      [],
    );

    const renamed = await mcpCall(chat.id, token, "tools/call", {
      name: "memory_update",
      arguments: {
        id: memoryId,
        instruction: "Always sign off as Veykor Test Bot v2.",
      },
    });

    assert.equal(isToolError(renamed.body), false);

    const removed = await mcpCall(chat.id, token, "tools/call", {
      name: "memory_delete",
      arguments: { id: memoryId },
    });

    assert.equal(isToolError(removed.body), false);

    const afterDelete = await request(memoryPaths.memory(memoryId), {
      cookie,
    });

    assert.equal(afterDelete.status, 404);
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});

test("a real turn persists explicit teaching and keeps it after chat deletion", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-memory-turn-"));
  const database = join(folder, "test.db");

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    const cookie = await authedCookie("turn-owner");

    const created = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(created.status, 201);

    const chatId = (created.body["chat"] as { id: string }).id;
    const instruction = "Always prefix release notes with the version number.";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let streamedTurnId = "";

    try {
      const response = await fetch(baseUrl + chatPaths.turns(chatId), {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          [veykorRequestHeaderName]: veykorRequestHeaderValue,
          Cookie: cookie,
        },
        body: JSON.stringify({
          text: `Remember this: ${instruction}`,
          images: [],
        }),
      });

      assert.equal(response.status, 200);
      assert.notEqual(response.body, null);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let sawEvent = false;

      for (let reads = 0; reads < 200; reads += 1) {
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        buffered += decoder.decode(chunk.value, { stream: true });

        if (buffered.includes("\n\n")) {
          sawEvent = true;
          break;
        }
      }

      assert.equal(sawEvent, true);

      const turnMatch = buffered.match(/"turnId"\s*:\s*"([^"]+)"/);

      if (turnMatch) {
        streamedTurnId = turnMatch[1];
      }

      controller.abort();

      await reader.cancel().catch(() => {});
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError")) {
        throw cause;
      }
    } finally {
      clearTimeout(timeout);
    }

    const stored = await request(memoryPaths.memories, { cookie });

    assert.equal(stored.status, 200);

    const memories = stored.body["memories"] as Array<{
      id: string;
      instruction: string;
      origin: string;
      sourceChatId: string;
      sourceExists: boolean;
    }>;

    const taught = memories.find((entry) =>
      entry.instruction.includes("prefix release notes"),
    );

    assert.ok(taught);
    assert.equal(taught.origin, "conversation");
    assert.equal(taught.sourceChatId, chatId);
    assert.equal(taught.sourceExists, true);

    if (streamedTurnId !== "") {
      await request(chatPaths.cancelTurn(chatId, streamedTurnId), {
        cookie,
        method: "POST",
      }).catch(() => ({ status: 0, body: {} }));
    }

    let deletedStatus = 0;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const deleted = await request(chatPaths.chat(chatId), {
        cookie,
        method: "DELETE",
      });

      deletedStatus = deleted.status;

      if (deletedStatus === 200) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    assert.equal(deletedStatus, 200);

    const afterDelete = await request(memoryPaths.memory(taught.id), {
      cookie,
    });

    assert.equal(afterDelete.status, 200);
    assert.equal(afterDelete.body["sourceExists"], false);
    assert.equal(afterDelete.body["instruction"], taught.instruction);
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});
