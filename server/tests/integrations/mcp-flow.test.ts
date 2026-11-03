import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const testPort = "31996";

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
    headers?: Record<string, string>;
    csrf?: boolean;
  } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.csrf === false
      ? {}
      : { [veykorRequestHeaderName]: veykorRequestHeaderValue }),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...options.headers,
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

const remoteHeaders = { "X-Forwarded-For": "192.168.1.2" };

function slept(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("MCP configuration, ownership, host-only stdio, and redaction", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-mcp-flow-"));
  const database = join(folder, "test.db");
  const launcher = join(folder, "launcher.mjs");
  const marker = join(folder, "launched.txt");

  writeFileSync(
    launcher,
    'import { appendFileSync } from "node:fs";\n' +
      `appendFileSync(${JSON.stringify(marker)}, "launched\\n");\n`,
  );

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    assert.equal((await request(integrationPaths.mcpServers)).status, 401);

    const registered = await request(authPaths.register, {
      body: { username: "mcp-owner", password: "a-strong-test-password" },
    });

    assert.equal(registered.status, 201);

    const cookie = registered.cookie;

    assert.deepEqual(
      (await request(integrationPaths.mcpServers, { cookie })).body,
      {
        servers: [],
        stdioAllowed: true,
      },
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          body: { name: "Search" },
          csrf: false,
        })
      ).status,
      403,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          headers: remoteHeaders,
        })
      ).body["stdioAllowed"],
      false,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          body: { name: "  ", transport: "stdio", command: "bin" },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          body: { name: "Search" },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          body: { name: "Search", transport: "stdio" },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          body: { name: "Remote", transport: "http" },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          body: {
            name: "Remote",
            transport: "http",
            url: "notaurl",
          },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          body: {
            name: "Search",
            transport: "stdio",
            command: "bin",
            url: "https://example.com",
          },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          body: {
            name: "Search",
            transport: "stdio",
            command: "bin",
            env: { "bad name": "value" },
          },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServers, {
          cookie,
          headers: remoteHeaders,
          body: { name: "Search", transport: "stdio", command: "bin" },
        })
      ).status,
      403,
    );

    const created = await request(integrationPaths.mcpServers, {
      cookie,
      body: {
        name: "Search",
        transport: "stdio",
        command: process.execPath,
        args: [launcher],
        env: { API_KEY: "super-secret-value" },
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body["name"], "Search");
    assert.equal(created.body["transport"], "stdio");
    assert.equal(created.body["command"], process.execPath);
    assert.deepEqual(created.body["args"], [launcher]);
    assert.deepEqual(created.body["envKeys"], ["API_KEY"]);
    assert.equal(created.body["hasSecrets"], true);
    assert.equal(created.body["enabled"], true);
    assert.equal(created.body["mode"], "required");
    assert.equal(
      JSON.stringify(created.body).includes("super-secret-value"),
      false,
    );

    const serverId = created.body["id"] as string;

    assert.notEqual(serverId, "");

    const duplicate = await request(integrationPaths.mcpServers, {
      cookie,
      body: { name: "Search", transport: "http", url: "https://example.com" },
    });

    assert.equal(duplicate.status, 409);

    const remote = await request(integrationPaths.mcpServers, {
      cookie,
      headers: remoteHeaders,
      body: {
        name: "Remote",
        transport: "http",
        url: "https://mcp.example.com/rpc",
        headers: { Authorization: "Bearer remote-secret" },
      },
    });

    assert.equal(remote.status, 201);

    const remoteId = remote.body["id"] as string;

    const edited = await request(integrationPaths.mcpServer(serverId), {
      cookie,
      method: "PUT",
      body: { name: "Finder", mode: "optional", enabled: false },
    });

    assert.equal(edited.status, 200);
    assert.equal(edited.body["name"], "Finder");
    assert.equal(edited.body["mode"], "optional");
    assert.equal(edited.body["enabled"], false);
    assert.deepEqual(edited.body["envKeys"], ["API_KEY"]);

    await slept(1000);

    assert.equal(existsSync(marker), false);

    assert.equal(
      (
        await request(integrationPaths.mcpServer(serverId), {
          cookie,
          headers: remoteHeaders,
          method: "PUT",
          body: { command: "replaced" },
        })
      ).status,
      403,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServer(serverId), {
          cookie,
          headers: remoteHeaders,
          method: "PUT",
          body: { args: ["replaced"] },
        })
      ).status,
      403,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServer(serverId), {
          cookie,
          headers: remoteHeaders,
          method: "PUT",
          body: { env: { API_KEY: "replaced" } },
        })
      ).status,
      403,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServer(serverId), {
          cookie,
          headers: remoteHeaders,
          method: "PUT",
          body: { transport: "http", url: "https://example.com" },
        })
      ).status,
      403,
    );

    const remoteEdit = await request(integrationPaths.mcpServer(serverId), {
      cookie,
      headers: remoteHeaders,
      method: "PUT",
      body: { name: "Finder", enabled: true },
    });

    assert.equal(remoteEdit.status, 200);
    assert.equal(remoteEdit.body["enabled"], true);

    const replaced = await request(integrationPaths.mcpServer(serverId), {
      cookie,
      method: "PUT",
      body: { env: { API_KEY: "rotated-secret", EXTRA: "more" } },
    });

    assert.equal(replaced.status, 200);
    assert.deepEqual(replaced.body["envKeys"], ["API_KEY", "EXTRA"]);
    assert.equal(
      JSON.stringify(replaced.body).includes("rotated-secret"),
      false,
    );

    const partial = await request(integrationPaths.mcpServer(serverId), {
      cookie,
      method: "PUT",
      body: { env: { EXTRA: "changed-again" } },
    });

    assert.equal(partial.status, 200);
    assert.deepEqual((partial.body["envKeys"] as Array<string>).sort(), [
      "API_KEY",
      "EXTRA",
    ]);

    const removed = await request(integrationPaths.mcpServer(serverId), {
      cookie,
      method: "PUT",
      body: { env: { API_KEY: null } },
    });

    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body["envKeys"], ["EXTRA"]);

    const cleared = await request(integrationPaths.mcpServer(serverId), {
      cookie,
      method: "PUT",
      body: { env: { EXTRA: null } },
    });

    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body["envKeys"], []);
    assert.equal(cleared.body["hasSecrets"], false);

    await slept(1000);

    assert.equal(existsSync(marker), false);

    const fetched = await request(integrationPaths.mcpServer(serverId), {
      cookie,
    });

    assert.equal(fetched.status, 200);
    assert.equal(fetched.body["command"], process.execPath);

    const listed = await request(integrationPaths.mcpServers, { cookie });

    assert.equal(listed.status, 200);
    assert.equal((listed.body["servers"] as Array<unknown>).length, 2);
    assert.equal(JSON.stringify(listed.body).includes("remote-secret"), false);

    const switched = await request(integrationPaths.mcpServer(remoteId), {
      cookie,
      method: "PUT",
      body: {
        transport: "stdio",
        command: "converted",
        args: [],
        env: {},
      },
    });

    assert.equal(switched.status, 200);
    assert.equal(switched.body["transport"], "stdio");
    assert.equal(switched.body["command"], "converted");
    assert.equal(switched.body["url"], "");
    assert.deepEqual(switched.body["headerNames"], []);

    const other = await request(authPaths.register, {
      body: { username: "mcp-stranger", password: "a-strong-test-password" },
    });

    assert.equal(other.status, 201);

    assert.deepEqual(
      (await request(integrationPaths.mcpServers, { cookie: other.cookie }))
        .body,
      { servers: [], stdioAllowed: true },
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServer(serverId), {
          cookie: other.cookie,
        })
      ).status,
      404,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServer(serverId), {
          cookie: other.cookie,
          method: "PUT",
          body: { name: "Stolen" },
        })
      ).status,
      404,
    );

    assert.equal(
      (
        await request(integrationPaths.mcpServer(serverId), {
          cookie: other.cookie,
          method: "DELETE",
        })
      ).status,
      404,
    );

    await stopServer(child);

    child = await startServer(database);

    const relisted = await request(integrationPaths.mcpServers, { cookie });

    assert.equal(
      (relisted.body["servers"] as Array<{ name: string }>).length,
      2,
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

    assert.equal(
      (await request(integrationPaths.mcpServer(serverId), { cookie })).status,
      404,
    );

    assert.equal(existsSync(marker), false);
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});

async function readTurnError(outcome: Response): Promise<string> {
  assert.notEqual(outcome.body, null);

  const reader = outcome.body!.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const boundary = buffered.indexOf("\n\n");

    if (boundary !== -1) {
      const block = buffered.slice(0, boundary);

      buffered = buffered.slice(boundary + 2);

      if (block.includes("event: turn-completed")) {
        const payload = JSON.parse(block.split("data: ")[1].split("\n")[0]);

        return (payload.error as string | undefined) ?? "";
      }

      if (block.includes("event: error")) {
        const payload = JSON.parse(block.split("data: ")[1].split("\n")[0]);

        return (payload.message as string | undefined) ?? "stream error";
      }

      continue;
    }

    const chunk = await reader.read();

    assert.equal(chunk.done, false);

    buffered += decoder.decode(chunk.value, { stream: true });
  }
}

test("required MCP failures surface actionable errors without breaking ordinary chat", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-mcp-failures-"));
  const database = join(folder, "test.db");

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    const registered = await request(authPaths.register, {
      body: { username: "mcp-failures", password: "a-strong-test-password" },
    });

    assert.equal(registered.status, 201);

    const cookie = registered.cookie;

    const bogus = await request(integrationPaths.mcpServers, {
      cookie,
      body: {
        name: "Bogus",
        transport: "stdio",
        command: "/nonexistent-binary-xyz",
        mode: "required",
      },
    });

    assert.equal(bogus.status, 201);

    const failing = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(failing.status, 201);

    const failingId = (failing.body as { chat: { id: string } }).chat.id;

    const turn = await fetch(baseUrl + chatPaths.turns(failingId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
        Cookie: cookie,
      },
      body: JSON.stringify({ text: "Reply with exactly: turn-ok" }),
      signal: AbortSignal.timeout(120000),
    });

    assert.equal(turn.status, 200);

    const error = await readTurnError(turn);

    assert.match(error, /Bogus/);
    assert.match(error, /Integrations/);

    const relaxed = await request(
      integrationPaths.mcpServer(bogus.body["id"] as string),
      { cookie, method: "PUT", body: { mode: "optional" } },
    );

    assert.equal(relaxed.status, 200);

    const tolerated = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(tolerated.status, 201);

    const toleratedId = (tolerated.body as { chat: { id: string } }).chat.id;
    const fetched = await request(chatPaths.chat(toleratedId), { cookie });

    assert.equal(fetched.status, 200);

    assert.equal(
      (
        await request(integrationPaths.mcpServer(bogus.body["id"] as string), {
          cookie,
          method: "DELETE",
        })
      ).status,
      200,
    );

    const chats = (await request(chatPaths.chats, { cookie }))
      .body as unknown as Array<{ id: string }>;

    assert.equal(chats.length, 2);

    const plain = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(plain.status, 201);
    assert.equal(
      (
        await request(
          chatPaths.chat((plain.body as { chat: { id: string } }).chat.id),
          {
            cookie,
          },
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
