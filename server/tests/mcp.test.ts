import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer, McpServersResponse, McpTestResult } from "@veykor/shared";

test("mcp servers persist per user and probe stdio connections", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-mcp-"));
  const port = "31994";
  const origin = `http://localhost:${port}`;
  let child: ChildProcess;
  child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      JWT_SECRET: "mcp-test-secret-thirty-two-bytes!!!!!",
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
    method = body === undefined ? "GET" : "POST",
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

    assert.equal((await request("mcp")).status, 401);

    const registered = await request(
      "auth/register",
      "",
      { username: "mcp-owner", password: "a-long-test-password" },
      "POST",
    );
    assert.equal(registered.status, 200);
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];

    const empty = (await (
      await request("mcp", cookie)
    ).json()) as McpServersResponse;
    assert.deepEqual(empty, { servers: [] });

    assert.equal(
      (await request("mcp", cookie, { name: "", transport: "stdio" })).status,
      400,
    );
    assert.equal(
      (
        await request("mcp", cookie, {
          name: "Broken",
          transport: "stdio",
          command: "",
          args: [],
          env: {},
          url: "",
          headers: {},
          enabled: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("mcp", cookie, {
          name: "Broken",
          transport: "http",
          command: "",
          args: [],
          env: {},
          url: "not-a-url",
          headers: {},
          enabled: true,
        })
      ).status,
      400,
    );

    const fixture = join(process.cwd(), "tests/fixtures/mcp-echo-server.ts");

    const createdResponse = await request("mcp", cookie, {
      name: "Echo",
      transport: "stdio",
      command: process.execPath,
      args: ["--import", "tsx", fixture],
      env: {},
      url: "",
      headers: {},
      enabled: true,
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as McpServer;
    assert.equal(created.name, "Echo");
    assert.equal(created.transport, "stdio");
    assert.equal(created.status, "unknown");
    assert.equal(created.toolCount, 0);

    const listed = (await (
      await request("mcp", cookie)
    ).json()) as McpServersResponse;
    assert.equal(listed.servers.length, 1);
    assert.equal(listed.servers[0].id, created.id);

    const draftProbe = (await (
      await request(
        "mcp/test",
        cookie,
        {
          name: "Draft",
          transport: "stdio",
          command: process.execPath,
          args: ["--import", "tsx", fixture],
          env: {},
          url: "",
          headers: {},
          enabled: true,
        },
        "POST",
      )
    ).json()) as McpTestResult;
    assert.equal(draftProbe.ok, true);
    assert.equal(draftProbe.toolCount, 1);
    assert.equal(draftProbe.tools[0].name, "echo");

    const failedProbe = (await (
      await request(
        "mcp/test",
        cookie,
        {
          name: "Missing",
          transport: "stdio",
          command: "veykor-definitely-missing-binary",
          args: [],
          env: {},
          url: "",
          headers: {},
          enabled: true,
        },
        "POST",
      )
    ).json()) as McpTestResult;
    assert.equal(failedProbe.ok, false);
    assert.equal(failedProbe.toolCount, 0);
    assert.ok(failedProbe.error.length > 0);

    const savedProbeResponse = await request(
      `mcp/${created.id}/test`,
      cookie,
      {},
      "POST",
    );
    assert.equal(savedProbeResponse.status, 200);
    const savedProbe = (await savedProbeResponse.json()) as McpTestResult;
    assert.equal(savedProbe.ok, true);
    assert.equal(savedProbe.toolCount, 1);

    const afterProbe = (await (
      await request("mcp", cookie)
    ).json()) as McpServersResponse;
    assert.equal(afterProbe.servers[0].status, "connected");
    assert.equal(afterProbe.servers[0].toolCount, 1);
    assert.ok(afterProbe.servers[0].lastChecked.length > 0);

    assert.equal(
      (await request(`mcp/missing-id/test`, cookie, {}, "POST")).status,
      404,
    );

    const renamedResponse = await request(
      `mcp/${created.id}`,
      cookie,
      {
        name: "Echo renamed",
        transport: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", fixture],
        env: {},
        url: "",
        headers: {},
        enabled: false,
      },
      "PUT",
    );
    assert.equal(renamedResponse.status, 200);
    const renamed = (await renamedResponse.json()) as McpServer;
    assert.equal(renamed.name, "Echo renamed");
    assert.equal(renamed.enabled, false);

    assert.equal(
      (await request(`mcp/missing-id`, cookie, undefined, "DELETE")).status,
      404,
    );

    const deleted = await request(
      `mcp/${created.id}`,
      cookie,
      undefined,
      "DELETE",
    );
    assert.equal(deleted.status, 200);

    const reloaded = (await (
      await request("mcp", cookie)
    ).json()) as McpServersResponse;
    assert.deepEqual(reloaded, { servers: [] });
  } finally {
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
    rmSync(folder, { recursive: true, force: true });
  }
});
