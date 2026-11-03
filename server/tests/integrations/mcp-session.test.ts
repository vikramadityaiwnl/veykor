import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authPaths,
  chatPaths,
  integrationPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31993";

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

const pingServerSource = `import { appendFileSync } from "node:fs";

const marker = process.env["PING_MARKER"] ?? "";

let buffer = "";

function send(value) {
  process.stdout.write(JSON.stringify(value) + "\\n");
}

process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => {
  buffer += chunk;

  let boundary = buffer.indexOf("\\n");

  while (boundary !== -1) {
    const line = buffer.slice(0, boundary).trim();

    buffer = buffer.slice(boundary + 1);
    boundary = buffer.indexOf("\\n");

    if (line === "") {
      continue;
    }

    let message = null;

    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }

    if (message.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "ping", version: "1.0.0" },
        },
      });
    } else if (message.method === "tools/list") {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [
            {
              name: "ping",
              description: "Record a marker and reply pong.",
              inputSchema: {
                type: "object",
                properties: { message: { type: "string" } },
                required: ["message"],
              },
            },
          ],
        },
      });
    } else if (message.method === "tools/call") {
      appendFileSync(marker, "ping:" + (message.params?.arguments?.message ?? "") + "\\n");
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [
            {
              type: "text",
              text: "pong:" + (message.params?.arguments?.message ?? ""),
            },
          ],
        },
      });
    } else if (message.id !== undefined) {
      send({ jsonrpc: "2.0", id: message.id, result: {} });
    }
  }
});
`;

interface TurnOutcome {
  terminal: string;
  error: string;
  sawToolCall: boolean;
  transcript: string;
}

async function runTurn(
  chatId: string,
  cookie: string,
  text: string,
): Promise<TurnOutcome> {
  const response = await fetch(baseUrl + chatPaths.turns(chatId), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [veykorRequestHeaderName]: veykorRequestHeaderValue,
      Cookie: cookie,
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(240000),
  });

  assert.equal(response.status, 200);
  assert.notEqual(response.body, null);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let buffered = "";
  let sawToolCall = false;
  let transcript = "";

  while (true) {
    const boundary = buffered.indexOf("\n\n");

    if (boundary !== -1) {
      const block = buffered.slice(0, boundary);

      buffered = buffered.slice(boundary + 2);
      transcript += block + "\n";

      if (block.includes('"tool":"mcp__')) {
        sawToolCall = true;
      }

      if (block.includes("event: turn-completed")) {
        const payload = JSON.parse(block.split("data: ")[1].split("\n")[0]);

        return {
          terminal: payload.terminal as string,
          error: (payload.error as string | undefined) ?? "",
          sawToolCall,
          transcript,
        };
      }

      if (block.includes("event: error")) {
        const payload = JSON.parse(block.split("data: ")[1].split("\n")[0]);

        return {
          terminal: "failed",
          error: (payload.message as string | undefined) ?? "stream error",
          sawToolCall,
          transcript,
        };
      }

      continue;
    }

    const chunk = await reader.read();

    assert.equal(chunk.done, false);

    buffered += decoder.decode(chunk.value, { stream: true });
  }
}

test("an enabled MCP server is usable through a real chat session", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-mcp-session-"));
  const database = join(folder, "test.db");
  const script = join(folder, "ping-server.mjs");
  const marker = join(folder, "ping-marker.txt");

  writeFileSync(script, pingServerSource);

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    const registered = await request(authPaths.register, {
      body: { username: "mcp-session", password: "a-strong-test-password" },
    });

    assert.equal(registered.status, 201);

    const cookie = registered.cookie;

    const created = await request(integrationPaths.mcpServers, {
      cookie,
      body: {
        name: "Ping",
        transport: "stdio",
        command: process.execPath,
        args: [script],
        env: { PING_MARKER: marker },
      },
    });

    assert.equal(created.status, 201);

    const serverId = created.body["id"] as string;

    const started = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(started.status, 201);

    const chatId = (started.body as { chat: { id: string } }).chat.id;

    const settings = await request(chatPaths.settings(chatId), {
      cookie,
      method: "PUT",
      body: { permission: "full-access" },
    });

    assert.equal(settings.status, 200);

    const outcome = await runTurn(
      chatId,
      cookie,
      "Call the ping tool with message set to hello-session, then reply with exactly: tool-done",
    );

    assert.equal(outcome.error, "");
    assert.equal(outcome.terminal, "completed");
    assert.equal(outcome.sawToolCall, true);
    assert.equal(outcome.transcript.includes(marker), false);
    assert.equal(
      readFileSync(marker, "utf8").includes("ping:hello-session"),
      true,
    );

    const disabled = await request(integrationPaths.mcpServer(serverId), {
      cookie,
      method: "PUT",
      body: { enabled: false },
    });

    assert.equal(disabled.status, 200);
    assert.equal(
      (await request(chatPaths.chat(chatId), { cookie })).status,
      200,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServer(serverId), {
          cookie,
          method: "DELETE",
        })
      ).status,
      200,
    );

    const removed = await request(chatPaths.chat(chatId), { cookie });

    assert.equal(removed.status, 502);
    assert.match((removed.body["error"] as string) ?? "", /Ping/);
    assert.match((removed.body["error"] as string) ?? "", /new chat/);

    const chats = (await request(chatPaths.chats, { cookie }))
      .body as unknown as Array<{ id: string }>;

    assert.ok(chats.some((entry) => entry.id === chatId));

    const fresh = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(fresh.status, 201);
    assert.equal(
      (
        await request(
          chatPaths.chat((fresh.body as { chat: { id: string } }).chat.id),
          { cookie },
        )
      ).status,
      200,
    );
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});
