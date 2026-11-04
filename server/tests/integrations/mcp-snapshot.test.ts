import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";

const folder = mkdtempSync(join(tmpdir(), "veykor-mcp-snapshot-"));

process.env["DATABASE_URL"] = join(folder, "test.db");

const {
  McpRestoreError,
  buildSessionMcp,
  parseMcpSnapshot,
  restoreSessionMcp,
} = await import("../../src/integrations/integrations.ts");
const { workspaceFor } = await import("../../src/muse/workspace.ts");
const { db } = await import("../../src/db/client.ts");
const { mcpServers, users } = await import("../../src/db/schema.ts");

const owner = db
  .insert(users)
  .values({ username: "snapshot-owner", passwordHash: "hash", createdAt: "" })
  .returning()
  .get();

function saveServer(input: {
  id: string;
  name: string;
  transport: string;
  config: Record<string, unknown>;
  enabled: number;
  mode: string;
}): void {
  db.insert(mcpServers)
    .values({
      id: input.id,
      userId: owner.id,
      name: input.name,
      transport: input.transport,
      config: JSON.stringify(input.config),
      enabled: input.enabled,
      mode: input.mode,
      createdAt: "",
      updatedAt: "",
    })
    .run();
}

saveServer({
  id: "stdio-server",
  name: "Search",
  transport: "stdio",
  config: {
    command: "uvx",
    args: ["mcp-server-fetch"],
    env: { API_KEY: "live-secret" },
  },
  enabled: 1,
  mode: "required",
});

saveServer({
  id: "http-server",
  name: "Remote",
  transport: "http",
  config: {
    url: "https://mcp.example.com/rpc",
    headers: { Authorization: "Bearer live-token" },
  },
  enabled: 1,
  mode: "optional",
});

saveServer({
  id: "disabled-server",
  name: "Paused",
  transport: "stdio",
  config: { command: "paused-bin", args: [], env: {} },
  enabled: 0,
  mode: "required",
});

test("enabled servers resolve to runtime config with protocol transports", () => {
  const session = buildSessionMcp(owner.id);

  assert.deepEqual(Object.keys(session.runtime).sort(), ["Remote", "Search"]);

  assert.deepEqual(session.runtime["Search"], {
    transport: "stdio",
    command: "uvx",
    mode: "required",
    args: ["mcp-server-fetch"],
    env: { API_KEY: "live-secret" },
  });

  assert.deepEqual(session.runtime["Remote"], {
    transport: "streamableHttp",
    url: "https://mcp.example.com/rpc",
    mode: "optional",
    headers: { Authorization: "Bearer live-token" },
  });
});

test("Chrome DevTools MCP receives the user's Veykor workspace automatically", () => {
  saveServer({
    id: "browser-server",
    name: "Browser",
    transport: "stdio",
    config: {
      command: "npx",
      args: ["-y", "chrome-devtools-mcp@latest", "--workspace=/custom"],
      env: {},
    },
    enabled: 1,
    mode: "required",
  });

  try {
    const session = buildSessionMcp(owner.id);
    const browser = session.runtime["Browser"];
    const workspaceRoot = join(workspaceFor(owner.id), ".veykor", "previews");

    assert.ok(browser?.transport === "stdio");
    assert.deepEqual(browser.args, [
      "-y",
      "chrome-devtools-mcp@latest",
      "--workspace=/custom",
      `--workspace=${workspaceRoot}`,
      "--isolated",
    ]);
    assert.deepEqual(
      session.snapshot.find((entry) => entry.id === "browser-server")?.args,
      ["-y", "chrome-devtools-mcp@latest", "--workspace=/custom"],
    );

    const restored = restoreSessionMcp(
      owner.id,
      JSON.stringify(session.snapshot),
    );

    assert.ok(restored["Browser"]?.transport === "stdio");
    assert.ok(
      restored["Browser"].args?.includes(`--workspace=${workspaceRoot}`),
    );
    assert.ok(restored["Browser"].args?.includes("--isolated"));
  } finally {
    db.delete(mcpServers).where(eq(mcpServers.id, "browser-server")).run();
  }
});

test("snapshots hold secret names without secret values", () => {
  const session = buildSessionMcp(owner.id);
  const raw = JSON.stringify(session.snapshot);

  assert.equal(raw.includes("live-secret"), false);
  assert.equal(raw.includes("live-token"), false);
  assert.equal(raw.includes("API_KEY"), true);
  assert.equal(raw.includes("Authorization"), true);
  assert.equal(session.snapshot.length, 2);
});

test("restoring replays the snapshot instead of current settings", () => {
  const raw = JSON.stringify(buildSessionMcp(owner.id).snapshot);

  db.update(mcpServers)
    .set({
      enabled: 0,
      config: JSON.stringify({
        command: "replaced-bin",
        args: [],
        env: { API_KEY: "changed-secret" },
      }),
    })
    .where(eq(mcpServers.id, "stdio-server"))
    .run();

  try {
    const restored = restoreSessionMcp(owner.id, raw);

    assert.deepEqual(Object.keys(restored).sort(), ["Remote", "Search"]);
    assert.equal((restored["Search"] as { command: string }).command, "uvx");
    assert.deepEqual((restored["Search"] as { env: unknown }).env, {
      API_KEY: "changed-secret",
    });
  } finally {
    db.update(mcpServers)
      .set({
        enabled: 1,
        config: JSON.stringify({
          command: "uvx",
          args: ["mcp-server-fetch"],
          env: { API_KEY: "live-secret" },
        }),
      })
      .where(eq(mcpServers.id, "stdio-server"))
      .run();
  }
});

test("restoring reports removed credentials without leaking values", () => {
  const raw = JSON.stringify(buildSessionMcp(owner.id).snapshot);

  db.update(mcpServers)
    .set({ config: JSON.stringify({ command: "uvx", args: [], env: {} }) })
    .where(eq(mcpServers.id, "stdio-server"))
    .run();

  try {
    assert.throws(() => restoreSessionMcp(owner.id, raw), McpRestoreError);

    try {
      restoreSessionMcp(owner.id, raw);
      assert.fail("expected restore to throw");
    } catch (cause) {
      assert.ok(cause instanceof McpRestoreError);
      assert.match(cause.message, /Search/);
      assert.match(cause.message, /API_KEY/);
      assert.equal(cause.message.includes("live-secret"), false);
    }
  } finally {
    db.update(mcpServers)
      .set({
        config: JSON.stringify({
          command: "uvx",
          args: ["mcp-server-fetch"],
          env: { API_KEY: "live-secret" },
        }),
      })
      .where(eq(mcpServers.id, "stdio-server"))
      .run();
  }
});

test("restoring keeps secret-free servers after deletion", () => {
  saveServer({
    id: "plain-server",
    name: "Plain",
    transport: "stdio",
    config: { command: "plain-bin", args: ["--serve"], env: {} },
    enabled: 1,
    mode: "required",
  });

  const full = JSON.stringify(buildSessionMcp(owner.id).snapshot);
  const plainOnly = JSON.stringify(
    parseMcpSnapshot(full).filter((entry) => entry.id === "plain-server"),
  );

  db.delete(mcpServers).run();

  const restored = restoreSessionMcp(owner.id, plainOnly);

  assert.deepEqual(restored["Plain"], {
    transport: "stdio",
    command: "plain-bin",
    mode: "required",
    args: ["--serve"],
  });

  assert.throws(() => restoreSessionMcp(owner.id, full), McpRestoreError);

  rmSync(folder, { recursive: true, force: true });
});

test("snapshot parsing tolerates corrupt and partial data", () => {
  assert.deepEqual(parseMcpSnapshot("not json"), []);
  assert.deepEqual(parseMcpSnapshot("{}"), []);

  assert.deepEqual(
    parseMcpSnapshot(
      JSON.stringify([
        {
          id: "kept",
          key: "Kept",
          transport: "stdio",
          command: "bin",
          args: [],
          envKeys: [],
          url: "",
          headerNames: [],
          mode: "required",
        },
        { key: "missing-id", transport: "stdio" },
        { id: "bad-transport", key: "Bad", transport: "sse" },
      ]),
    ),
    [
      {
        id: "kept",
        key: "Kept",
        transport: "stdio",
        command: "bin",
        args: [],
        envKeys: [],
        url: "",
        headerNames: [],
        mode: "required",
      },
    ],
  );
});
