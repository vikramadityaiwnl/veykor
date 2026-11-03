import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyMcpList,
  mcpStdioFieldsError,
  mcpValidationError,
} from "@veykor/shared";

test("MCP validation accepts complete stdio and HTTP configurations", () => {
  assert.equal(
    mcpValidationError(
      {
        name: "Search",
        transport: "stdio",
        enabled: true,
        mode: "required",
        command: "uvx",
        args: ["mcp-server-fetch"],
        env: { API_KEY: "secret-value" },
      },
      { partial: false },
    ),
    "",
  );

  assert.equal(
    mcpValidationError(
      {
        name: "Remote",
        transport: "http",
        url: "https://mcp.example.com/rpc",
        headers: { Authorization: "Bearer token" },
      },
      { partial: false },
    ),
    "",
  );

  assert.equal(
    mcpStdioFieldsError("stdio", { command: "uvx" }, { partial: false }),
    "",
  );

  assert.equal(
    mcpStdioFieldsError(
      "http",
      { url: "https://mcp.example.com/rpc" },
      { partial: false },
    ),
    "",
  );
});

test("MCP validation rejects missing names, transports, and endpoints", () => {
  assert.notEqual(
    mcpValidationError({ transport: "stdio" }, { partial: false }),
    "",
  );

  assert.notEqual(mcpValidationError({ name: "  " }, { partial: false }), "");

  assert.notEqual(
    mcpValidationError({ name: "Search" }, { partial: false }),
    "",
  );

  assert.notEqual(
    mcpValidationError(
      { name: "Search", transport: "stdio", mode: "sometimes" as never },
      { partial: false },
    ),
    "",
  );

  assert.notEqual(
    mcpStdioFieldsError("stdio", { command: "  " }, { partial: false }),
    "",
  );

  assert.notEqual(
    mcpStdioFieldsError("http", { url: "not-a-url" }, { partial: false }),
    "",
  );

  assert.notEqual(
    mcpStdioFieldsError(
      "http",
      { url: "ftp://example.com" },
      { partial: false },
    ),
    "",
  );

  assert.notEqual(mcpStdioFieldsError("http", {}, { partial: false }), "");
});

test("MCP validation rejects malformed arguments and secrets", () => {
  assert.notEqual(
    mcpValidationError(
      { name: "Search", transport: "stdio", args: "nope" as never },
      { partial: false },
    ),
    "",
  );

  assert.notEqual(
    mcpValidationError(
      { name: "Search", transport: "stdio", env: { "bad name": "x" } },
      { partial: false },
    ),
    "",
  );

  assert.notEqual(
    mcpValidationError(
      { name: "Search", transport: "stdio", env: { "9LIVES": "x" } },
      { partial: false },
    ),
    "",
  );

  assert.notEqual(
    mcpValidationError(
      {
        name: "Remote",
        transport: "http",
        headers: { "Bad Header!": "x" },
      },
      { partial: false },
    ),
    "",
  );

  assert.notEqual(
    mcpValidationError(
      {
        name: "Remote",
        transport: "http",
        headers: { Authorization: "one\ntwo" },
      },
      { partial: false },
    ),
    "",
  );
});

test("MCP partial validation only checks supplied fields", () => {
  assert.equal(mcpValidationError({ enabled: false }, { partial: true }), "");
  assert.equal(mcpValidationError({ mode: "optional" }, { partial: true }), "");
  assert.equal(
    mcpValidationError({ env: { API_KEY: null } }, { partial: true }),
    "",
  );

  assert.notEqual(
    mcpValidationError(
      {
        name: "Search",
        transport: "stdio",
        env: { API_KEY: null },
      },
      { partial: false },
    ),
    "",
  );

  assert.notEqual(mcpValidationError({ name: "" }, { partial: true }), "");

  assert.notEqual(
    mcpValidationError({ transport: "sse" as never }, { partial: true }),
    "",
  );

  assert.equal(mcpStdioFieldsError("stdio", {}, { partial: true }), "");

  assert.equal(mcpStdioFieldsError("http", {}, { partial: true }), "");
});

test("empty MCP lists carry complete default shapes", () => {
  assert.deepEqual(emptyMcpList(true), { servers: [], stdioAllowed: true });
  assert.deepEqual(emptyMcpList(false), { servers: [], stdioAllowed: false });
});
