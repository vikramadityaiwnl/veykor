import { homedir } from "node:os";
import { Hono } from "hono";
import type { McpDetectedAction } from "@veykor/shared";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { probeMcpServer } from "../mcp/client.js";
import { readDetectedEntry, removeDetectedEntry, scanDetectedServers } from "../mcp/detect.js";
import { createMcpServer, deleteMcpServer, listMcpServers, readMcpServer, recordMcpProbe, updateMcpServer } from "../mcp/store.js";
import { normalizeMcpInput, validMcpInput } from "../mcp/validation.js";

export const mcpRoute = new Hono<AuthEnv>();

mcpRoute.use("*", requireAuth);

mcpRoute.get("/", (c) => c.json({ servers: listMcpServers(c.get("user").id) }));

mcpRoute.post("/", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validMcpInput(input)) {
    return c.json({ error: "Enter a valid MCP server." }, 400);
  }

  if (listMcpServers(c.get("user").id).length >= 50) {
    return c.json({ error: "You can add up to 50 MCP servers." }, 400);
  }

  return c.json(
    createMcpServer(c.get("user").id, normalizeMcpInput(input)),
    201,
  );
});

mcpRoute.put("/:id", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validMcpInput(input)) {
    return c.json({ error: "Enter a valid MCP server." }, 400);
  }

  const updated = updateMcpServer(
    c.get("user").id,
    c.req.param("id"),
    normalizeMcpInput(input),
  );

  if (!updated) {
    return c.json({ error: "MCP server not found" }, 404);
  }

  return c.json(updated);
});

mcpRoute.delete("/:id", (c) => {
  const deleted = deleteMcpServer(c.get("user").id, c.req.param("id"));

  if (!deleted) {
    return c.json({ error: "MCP server not found" }, 404);
  }

  return c.json({ ok: true });
});

mcpRoute.get("/detected", (c) => {
  return c.json({
    sources: scanDetectedServers().map((source) => ({
      id: source.id,
      label: source.label,
      path: source.path,
      servers: source.entries.map((entry) => ({
        key: entry.key,
        name: entry.name,
        transport: entry.input.transport,
        command: entry.input.command,
        args: entry.input.args,
        url: entry.input.url,
      })),
    })),
  });
});

function validDetectedAction(input: unknown): input is McpDetectedAction {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Record<string, unknown>;

  return (
    typeof candidate.sourceId === "string" &&
    candidate.sourceId.length > 0 &&
    candidate.sourceId.length <= 100 &&
    typeof candidate.serverKey === "string" &&
    candidate.serverKey.length > 0 &&
    candidate.serverKey.length <= 1000
  );
}

mcpRoute.post("/detected/test", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validDetectedAction(input)) {
    return c.json({ error: "Choose a detected server." }, 400);
  }

  const entry = readDetectedEntry(homedir(), input.sourceId, input.serverKey);

  if (!entry || !validMcpInput(entry)) {
    return c.json({ error: "Detected server not found" }, 404);
  }

  return c.json(await probeMcpServer(normalizeMcpInput(entry)));
});

mcpRoute.post("/detected/remove", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validDetectedAction(input)) {
    return c.json({ error: "Choose a detected server." }, 400);
  }

  const removed = removeDetectedEntry(
    homedir(),
    input.sourceId,
    input.serverKey,
  );

  if (!removed) {
    return c.json({ error: "Detected server not found" }, 404);
  }

  return c.json({ ok: true });
});

mcpRoute.post("/test", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validMcpInput(input)) {
    return c.json({ error: "Enter a valid MCP server." }, 400);
  }

  return c.json(await probeMcpServer(normalizeMcpInput(input)));
});

mcpRoute.post("/:id/test", async (c) => {
  const server = readMcpServer(c.get("user").id, c.req.param("id"));

  if (!server) {
    return c.json({ error: "MCP server not found" }, 404);
  }

  const result = await probeMcpServer(server);

  recordMcpProbe(c.get("user").id, server.id, {
    ok: result.ok,
    toolCount: result.toolCount,
    error: result.error,
  });

  return c.json(result);
});
