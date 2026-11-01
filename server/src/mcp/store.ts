import { and, eq } from "drizzle-orm";
import type { McpServer, McpServerStatus, McpTransport } from "@veykor/shared";
import { db } from "../db/client.js";
import { mcpServers } from "../db/schema.js";

type Row = typeof mcpServers.$inferSelect;

function parseArgs(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function parseRecord(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, string> = {};

    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry === "string") {
        result[key] = entry;
      }
    }

    return result;
  } catch {
    return {};
  }
}

function toStatus(value: string): McpServerStatus {
  return value === "connected" || value === "error" ? value : "unknown";
}

function toTransport(value: string): McpTransport {
  return value === "http" || value === "sse" ? value : "stdio";
}

function toIso(value: number): string {
  return value > 0 ? new Date(value).toISOString() : "";
}

export function toMcpServer(row: Row): McpServer {
  return {
    id: row.id,
    name: row.name,
    transport: toTransport(row.transport),
    command: row.command,
    args: parseArgs(row.args),
    env: parseRecord(row.env),
    url: row.url,
    headers: parseRecord(row.headers),
    enabled: row.enabled === 1,
    status: toStatus(row.status),
    lastError: row.lastError,
    toolCount: row.toolCount,
    lastChecked: toIso(row.lastChecked),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function listMcpServers(userId: number): McpServer[] {
  return db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, userId))
    .all()
    .map(toMcpServer)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readMcpServer(userId: number, id: string): McpServer | null {
  const row = db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.id, id)))
    .get();

  return row ? toMcpServer(row) : null;
}

export interface McpServerInput {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
}

export function createMcpServer(
  userId: number,
  input: McpServerInput,
): McpServer {
  const now = Date.now();
  const id = crypto.randomUUID();

  db.insert(mcpServers)
    .values({
      id,
      userId,
      name: input.name,
      transport: input.transport,
      command: input.command,
      args: JSON.stringify(input.args),
      env: JSON.stringify(input.env),
      url: input.url,
      headers: JSON.stringify(input.headers),
      enabled: input.enabled ? 1 : 0,
      status: "unknown",
      lastError: "",
      toolCount: 0,
      lastChecked: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return readMcpServer(userId, id)!;
}

export function updateMcpServer(
  userId: number,
  id: string,
  input: McpServerInput,
): McpServer | null {
  const existing = readMcpServer(userId, id);

  if (!existing) {
    return null;
  }

  db.update(mcpServers)
    .set({
      name: input.name,
      transport: input.transport,
      command: input.command,
      args: JSON.stringify(input.args),
      env: JSON.stringify(input.env),
      url: input.url,
      headers: JSON.stringify(input.headers),
      enabled: input.enabled ? 1 : 0,
      updatedAt: Date.now(),
    })
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.id, id)))
    .run();

  return readMcpServer(userId, id);
}

export function deleteMcpServer(userId: number, id: string): boolean {
  const existing = readMcpServer(userId, id);

  if (!existing) {
    return false;
  }

  db.delete(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.id, id)))
    .run();

  return true;
}

export function recordMcpProbe(
  userId: number,
  id: string,
  probe: { ok: boolean; toolCount: number; error: string },
): McpServer | null {
  db.update(mcpServers)
    .set({
      status: probe.ok ? "connected" : "error",
      lastError: probe.error,
      toolCount: probe.toolCount,
      lastChecked: Date.now(),
      updatedAt: Date.now(),
    })
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.id, id)))
    .run();

  return readMcpServer(userId, id);
}
