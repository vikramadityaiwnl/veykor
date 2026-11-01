import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { probeMcpServer } from "../mcp/client.js";
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
