import { test } from "node:test";
import assert from "node:assert/strict";
import type { CreateMcpServerInput, McpServer } from "@veykor/shared";
import { isSessionMcpNameConflict, mergeSessionMcpSources, toSessionMcpServers } from "../src/mcp/session-config.js";

function server(partial: Partial<McpServer>): McpServer {
  return {
    id: crypto.randomUUID(),
    name: "Docs",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-package"],
    env: { API_KEY: "key" },
    url: "",
    headers: {},
    enabled: true,
    status: "unknown",
    lastError: "",
    toolCount: 0,
    lastChecked: "",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

test("chat recognizes Muse session MCP name conflicts", () => {
  assert.equal(
    isSessionMcpNameConflict(
      new Error(
        "session MCP server name conflicts with a host or plugin server",
      ),
    ),
    true,
  );
  assert.equal(isSessionMcpNameConflict(new Error("Model unavailable")), false);
});

test("chat forwards enabled stdio and http servers as optional session servers", () => {
  const mapped = toSessionMcpServers([
    server({ name: "Docs" }),
    server({
      name: "Remote",
      transport: "http",
      command: "",
      args: [],
      env: {},
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer token" },
    }),
  ]);

  assert.deepEqual(mapped, {
    Docs: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-server-package"],
      env: { API_KEY: "key" },
      mode: "optional",
    },
    Remote: {
      transport: "streamableHttp",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer token" },
      mode: "optional",
    },
  });
});

test("chat skips disabled, sse, and blank servers and dedupes names", () => {
  const mapped = toSessionMcpServers([
    server({ name: "Off", enabled: false }),
    server({
      name: "Legacy",
      transport: "sse",
      url: "https://example.com/sse",
    }),
    server({ name: "   " }),
    server({ name: "Docs", command: "   " }),
    server({ name: "Dup" }),
    server({ name: "Dup", command: "other" }),
  ]);

  assert.deepEqual(mapped, {
    Dup: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-server-package"],
      env: { API_KEY: "key" },
      mode: "optional",
    },
    "Dup (2)": {
      transport: "stdio",
      command: "other",
      args: ["-y", "mcp-server-package"],
      env: { API_KEY: "key" },
      mode: "optional",
    },
  });
});

test("chat gives chrome-devtools the conversation folder as its workspace root", () => {
  const mapped = toSessionMcpServers(
    [
      server({
        name: "Browser",
        command: "npx",
        args: ["-y", "chrome-devtools-mcp@latest"],
        env: {},
      }),
      server({ name: "Docs" }),
    ],
    "/tmp/veykor-workspace",
  );

  assert.deepEqual(mapped, {
    Browser: {
      transport: "stdio",
      command: "npx",
      args: [
        "-y",
        "chrome-devtools-mcp@latest",
        "--workspace=/tmp/veykor-workspace",
      ],
      mode: "optional",
    },
    Docs: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-server-package"],
      env: { API_KEY: "key" },
      mode: "optional",
    },
  });
});

test("chat keeps a user configured browser workspace root", () => {
  const mapped = toSessionMcpServers(
    [
      server({
        name: "Browser",
        command: "chrome-devtools-mcp",
        args: ["--workspace=/tmp/custom"],
        env: {},
      }),
    ],
    "/tmp/veykor-workspace",
  );

  assert.deepEqual(mapped, {
    Browser: {
      transport: "stdio",
      command: "chrome-devtools-mcp",
      args: ["--workspace=/tmp/custom"],
      mode: "optional",
    },
  });

  const unscoped = toSessionMcpServers(
    [
      server({
        name: "Browser",
        command: "npx",
        args: ["-y", "chrome-devtools-mcp@latest"],
        env: {},
      }),
    ],
    "",
  )?.Browser;

  assert.ok(unscoped && unscoped.transport === "stdio");
  assert.equal(unscoped.args?.length, 2);
});

test("chat omits empty collections and returns undefined without servers", () => {
  const mapped = toSessionMcpServers([
    server({ name: "Bare", args: [], env: {} }),
  ]);

  assert.deepEqual(mapped, {
    Bare: { transport: "stdio", command: "npx", mode: "optional" },
  });

  assert.equal(toSessionMcpServers([]), undefined);
  assert.equal(toSessionMcpServers([server({ enabled: false })]), undefined);
});

test("chat merges managed and detected servers with managed winning duplicates", () => {
  const detected: CreateMcpServerInput[] = [
    {
      name: "Also Docs",
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-server-package"],
      env: {},
      url: "",
      headers: {},
      enabled: true,
    },
    {
      name: "Shop",
      transport: "stdio",
      command: "/bin/shop-mcp",
      args: ["--fast"],
      env: {},
      url: "",
      headers: {},
      enabled: true,
    },
    {
      name: "Shop copy",
      transport: "stdio",
      command: "/bin/shop-mcp",
      args: ["--fast"],
      env: {},
      url: "",
      headers: {},
      enabled: true,
    },
  ];

  const merged = mergeSessionMcpSources([server({ name: "Docs" })], detected);

  assert.deepEqual(
    merged.map((entry) => entry.name),
    ["Docs", "Shop"],
  );
  assert.ok(merged.every((entry) => entry.enabled));

  const mapped = toSessionMcpServers(merged);

  assert.deepEqual(Object.keys(mapped || {}).sort(), ["Docs", "Shop"]);
  assert.equal(merged.length, 2);
});
