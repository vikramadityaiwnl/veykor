import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, asc, eq } from "drizzle-orm";
import type { SessionMcpServerConfig } from "@muse-code/sdk/dist/src/msp.js";
import {
  emptyMcpList,
  normalizeMcpName,
  mcpStdioFieldsError,
  mcpValidationError,
} from "@veykor/shared";
import type {
  CreateMcpServerRequest,
  McpSecretPatch,
  McpServerMode,
  McpServerSummary,
  McpTransport,
  UpdateMcpServerRequest,
} from "@veykor/shared";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import { isHostRequest } from "../auth/host-access.js";
import { db } from "../db/client.js";
import { mcpServers } from "../db/schema.js";
import { workspaceFor } from "../muse/workspace.js";

type McpRow = typeof mcpServers.$inferSelect;

export interface McpSnapshotEntry {
  id: string;
  key: string;
  transport: McpTransport;
  command: string;
  args: Array<string>;
  envKeys: Array<string>;
  url: string;
  headerNames: Array<string>;
  mode: McpServerMode;
}

interface StoredMcpConfig {
  command: string;
  args: Array<string>;
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown): Array<string> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function stringMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }

  return result;
}

function parseStoredConfig(raw: string): StoredMcpConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const config =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};

  return {
    command: text(config["command"]),
    args: stringList(config["args"]),
    env: stringMap(config["env"]),
    url: text(config["url"]),
    headers: stringMap(config["headers"]),
  };
}

function readTransport(row: McpRow): McpTransport {
  return row.transport === "http" ? "http" : "stdio";
}

function readMode(row: McpRow): McpServerMode {
  return row.mode === "optional" ? "optional" : "required";
}

export function toMcpSummary(row: McpRow): McpServerSummary {
  const config = parseStoredConfig(row.config ?? "{}");
  const transport = readTransport(row);

  const envKeys = transport === "stdio" ? Object.keys(config.env) : [];
  const headerNames = transport === "http" ? Object.keys(config.headers) : [];

  return {
    id: row.id,
    name: row.name ?? "",
    transport,
    command: transport === "stdio" ? config.command : "",
    args: transport === "stdio" ? config.args : [],
    envKeys,
    url: transport === "http" ? config.url : "",
    headerNames,
    hasSecrets: envKeys.length + headerNames.length > 0,
    enabled: (row.enabled ?? 1) === 1,
    mode: readMode(row),
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

export function readMcpServer(userId: number, id: string): McpRow | undefined {
  return db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
    .get();
}

function applySecretPatch(
  current: Record<string, string>,
  patch: McpSecretPatch,
): Record<string, string> {
  const next = { ...current };

  for (const [name, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[name];
    } else {
      next[name] = value;
    }
  }

  return next;
}

function nameTaken(userId: number, name: string, exceptId?: string): boolean {
  const rows = db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, userId))
    .all();

  return rows.some((row) => row.name === name && row.id !== exceptId);
}

function toRuntimeConfig(
  transport: McpTransport,
  config: StoredMcpConfig,
  mode: McpServerMode,
  workspaceRoot: string,
): SessionMcpServerConfig {
  if (transport === "http") {
    if (Object.keys(config.headers).length > 0) {
      return {
        transport: "streamableHttp",
        url: config.url,
        mode,
        headers: { ...config.headers },
      };
    }

    return {
      transport: "streamableHttp",
      url: config.url,
      mode,
    };
  }

  const args = [...config.args];
  const executable = `${config.command} ${args.join(" ")}`.toLowerCase();

  if (executable.includes("chrome-devtools-mcp")) {
    const previewRoot = join(workspaceRoot, ".veykor", "previews");
    const configuredRoots = new Set<string>();

    mkdirSync(previewRoot, { recursive: true });

    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];
      const value = argument?.match(/^--workspace=(.*)$/)?.[1];

      if (value) {
        configuredRoots.add(value);
      } else if (argument === "--workspace") {
        const next = args[index + 1];

        if (next) {
          configuredRoots.add(next);
        }
      }
    }

    if (!configuredRoots.has(previewRoot)) {
      args.push(`--workspace=${previewRoot}`);
    }

    if (!args.includes("--isolated")) {
      args.push("--isolated");
    }
  }

  if (args.length > 0 && Object.keys(config.env).length > 0) {
    return {
      transport: "stdio",
      command: config.command,
      mode,
      args,
      env: { ...config.env },
    };
  }

  if (args.length > 0) {
    return {
      transport: "stdio",
      command: config.command,
      mode,
      args,
    };
  }

  if (Object.keys(config.env).length > 0) {
    return {
      transport: "stdio",
      command: config.command,
      mode,
      env: { ...config.env },
    };
  }

  return {
    transport: "stdio",
    command: config.command,
    mode,
  };
}

function toSnapshotEntry(row: McpRow): McpSnapshotEntry {
  const config = parseStoredConfig(row.config ?? "{}");
  const transport = readTransport(row);

  return {
    id: row.id,
    key: row.name ?? "",
    transport,
    command: transport === "stdio" ? config.command : "",
    args: transport === "stdio" ? [...config.args] : [],
    envKeys: transport === "stdio" ? Object.keys(config.env) : [],
    url: transport === "http" ? config.url : "",
    headerNames: transport === "http" ? Object.keys(config.headers) : [],
    mode: readMode(row),
  };
}

function sanitizeSnapshotEntry(value: unknown): McpSnapshotEntry | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const entry = value as Record<string, unknown>;

  if (typeof entry["id"] !== "string" || entry["id"] === "") {
    return null;
  }

  if (typeof entry["key"] !== "string" || entry["key"] === "") {
    return null;
  }

  const transport = entry["transport"];

  if (transport !== "stdio" && transport !== "http") {
    return null;
  }

  return {
    id: entry["id"],
    key: entry["key"],
    transport,
    command: text(entry["command"]),
    args: stringList(entry["args"]),
    envKeys: stringList(entry["envKeys"]),
    url: text(entry["url"]),
    headerNames: stringList(entry["headerNames"]),
    mode: entry["mode"] === "optional" ? "optional" : "required",
  };
}

export function parseMcpSnapshot(raw: string): Array<McpSnapshotEntry> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const entries: Array<McpSnapshotEntry> = [];

  for (const entry of parsed) {
    const sanitized = sanitizeSnapshotEntry(entry);

    if (sanitized) {
      entries.push(sanitized);
    }
  }

  return entries;
}

export function buildSessionMcp(userId: number): {
  snapshot: Array<McpSnapshotEntry>;
  runtime: Record<string, SessionMcpServerConfig>;
} {
  const rows = db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.enabled, 1)))
    .orderBy(asc(mcpServers.name))
    .all();

  const snapshot: Array<McpSnapshotEntry> = [];
  const runtime: Record<string, SessionMcpServerConfig> = {};

  for (const row of rows) {
    const entry = toSnapshotEntry(row);

    snapshot.push(entry);
    runtime[entry.key] = toRuntimeConfig(
      entry.transport,
      parseStoredConfig(row.config ?? "{}"),
      entry.mode,
      workspaceFor(userId),
    );
  }

  return { snapshot, runtime };
}

export class McpRestoreError extends Error {}

function missingSecretMessage(
  serverName: string,
  kind: string,
  secretName: string,
): string {
  return (
    `MCP server "${serverName}" needs its saved ${kind} "${secretName}" again. ` +
    "Open Integrations and re-enter it, or start a new chat without that server."
  );
}

export function restoreSessionMcp(
  userId: number,
  rawSnapshot: string,
): Record<string, SessionMcpServerConfig> {
  const runtime: Record<string, SessionMcpServerConfig> = {};

  for (const entry of parseMcpSnapshot(rawSnapshot)) {
    const row = readMcpServer(userId, entry.id);

    if (!row) {
      if (entry.envKeys.length + entry.headerNames.length > 0) {
        throw new McpRestoreError(
          `MCP server "${entry.key}" was deleted after this chat started, ` +
            "and this chat needs its saved secrets. Restore the server in " +
            "Integrations, or start a new chat without it.",
        );
      }

      runtime[entry.key] = toRuntimeConfig(
        entry.transport,
        {
          command: entry.command,
          args: entry.args,
          env: {},
          url: entry.url,
          headers: {},
        },
        entry.mode,
        workspaceFor(userId),
      );

      continue;
    }

    const live = parseStoredConfig(row.config ?? "{}");

    const env: Record<string, string> = {};

    for (const name of entry.envKeys) {
      if (!(name in live.env)) {
        throw new McpRestoreError(
          missingSecretMessage(entry.key, "environment variable", name),
        );
      }

      env[name] = live.env[name];
    }

    const headers: Record<string, string> = {};

    for (const name of entry.headerNames) {
      if (!(name in live.headers)) {
        throw new McpRestoreError(
          missingSecretMessage(entry.key, "header", name),
        );
      }

      headers[name] = live.headers[name];
    }

    runtime[entry.key] = toRuntimeConfig(
      entry.transport,
      {
        command: entry.command,
        args: entry.args,
        env,
        url: entry.url,
        headers,
      },
      entry.mode,
      workspaceFor(userId),
    );
  }

  return runtime;
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const parsed = (await c.req.json()) as unknown;

    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to empty input
  }

  return {};
}

function wrongSideError(
  transport: McpTransport,
  body: Record<string, unknown>,
): string {
  if (transport === "stdio") {
    if (body["url"] !== undefined || body["headers"] !== undefined) {
      return "Endpoint URL and headers apply to streamable HTTP servers.";
    }

    return "";
  }

  if (
    body["command"] !== undefined ||
    body["args"] !== undefined ||
    body["env"] !== undefined
  ) {
    return "Executable, arguments, and environment apply to standard I/O servers.";
  }

  return "";
}

export const integrationsRoute = new Hono<AuthEnv>();

integrationsRoute.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

integrationsRoute.get("/mcp", requireAuth, (c) => {
  const rows = db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, c.get("user").id))
    .orderBy(asc(mcpServers.name))
    .all();

  return c.json({
    ...emptyMcpList(isHostRequest(c)),
    servers: rows.map(toMcpSummary),
  });
});

integrationsRoute.post("/mcp", requireAuth, async (c) => {
  const body = await readJson(c);
  const input = body as Partial<CreateMcpServerRequest>;

  const validationError = mcpValidationError(input, { partial: false });

  if (validationError !== "") {
    return c.json({ error: validationError }, 400);
  }

  const transport = input.transport ?? "stdio";

  const fieldsError = mcpStdioFieldsError(
    transport,
    { command: input.command, url: input.url },
    { partial: false },
  );

  if (fieldsError !== "") {
    return c.json({ error: fieldsError }, 400);
  }

  const sideError = wrongSideError(transport, body);

  if (sideError !== "") {
    return c.json({ error: sideError }, 400);
  }

  if (transport === "stdio" && !isHostRequest(c)) {
    return c.json(
      { error: "Standard I/O servers can only be added on the host computer." },
      403,
    );
  }

  const userId = c.get("user").id;
  const name = normalizeMcpName(input.name);

  if (nameTaken(userId, name)) {
    return c.json({ error: "Another server already uses that name." }, 409);
  }

  const config: StoredMcpConfig =
    transport === "stdio"
      ? {
          command: (input.command ?? "").trim(),
          args: Array.isArray(input.args) ? [...input.args] : [],
          env: { ...(input.env ?? {}) },
          url: "",
          headers: {},
        }
      : {
          command: "",
          args: [],
          env: {},
          url: (input.url ?? "").trim(),
          headers: { ...(input.headers ?? {}) },
        };

  const id = randomUUID();
  const stamp = nowIso();

  try {
    db.insert(mcpServers)
      .values({
        id,
        userId,
        name,
        transport,
        config: JSON.stringify(config),
        enabled: input.enabled === false ? 0 : 1,
        mode: input.mode === "optional" ? "optional" : "required",
        createdAt: stamp,
        updatedAt: stamp,
      })
      .run();
  } catch {
    return c.json({ error: "Another server already uses that name." }, 409);
  }

  const row = readMcpServer(userId, id);

  if (!row) {
    return c.json({ error: "Unable to save the server." }, 500);
  }

  return c.json(toMcpSummary(row), 201);
});

integrationsRoute.get("/mcp/:id", requireAuth, (c) => {
  const row = readMcpServer(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Server not found" }, 404);
  }

  return c.json(toMcpSummary(row));
});

integrationsRoute.put("/mcp/:id", requireAuth, async (c) => {
  const userId = c.get("user").id;
  const row = readMcpServer(userId, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Server not found" }, 404);
  }

  const body = await readJson(c);
  const input = body as Partial<UpdateMcpServerRequest>;

  const validationError = mcpValidationError(input, { partial: true });

  if (validationError !== "") {
    return c.json({ error: validationError }, 400);
  }

  const stored = parseStoredConfig(row.config ?? "{}");
  const storedTransport = readTransport(row);
  const transport = input.transport ?? storedTransport;

  if (
    (input.transport !== undefined && input.transport !== storedTransport) ||
    (storedTransport === "stdio" &&
      (input.command !== undefined ||
        input.args !== undefined ||
        input.env !== undefined))
  ) {
    if (!isHostRequest(c)) {
      return c.json(
        {
          error:
            "Executable, arguments, and environment can only be changed on the host computer.",
        },
        403,
      );
    }
  }

  const fieldsError = mcpStdioFieldsError(
    transport,
    {
      command: input.command ?? stored.command,
      url: input.url ?? stored.url,
    },
    { partial: false },
  );

  if (fieldsError !== "") {
    return c.json({ error: fieldsError }, 400);
  }

  const sideError = wrongSideError(transport, body);

  if (sideError !== "") {
    return c.json({ error: sideError }, 400);
  }

  const name =
    input.name !== undefined ? normalizeMcpName(input.name) : (row.name ?? "");

  if (name === "") {
    return c.json({ error: "Give the server a name." }, 400);
  }

  if (nameTaken(userId, name, row.id)) {
    return c.json({ error: "Another server already uses that name." }, 409);
  }

  const switched = transport !== storedTransport;

  const env =
    input.env !== undefined
      ? applySecretPatch(switched ? {} : stored.env, input.env)
      : switched
        ? {}
        : stored.env;

  const headers =
    input.headers !== undefined
      ? applySecretPatch(switched ? {} : stored.headers, input.headers)
      : switched
        ? {}
        : stored.headers;

  if (Object.keys(env).length > 64) {
    return c.json({ error: "Use at most 64 environment variables." }, 400);
  }

  if (Object.keys(headers).length > 64) {
    return c.json({ error: "Use at most 64 headers." }, 400);
  }

  const config: StoredMcpConfig =
    transport === "stdio"
      ? {
          command:
            input.command !== undefined
              ? input.command.trim()
              : switched
                ? ""
                : stored.command,
          args:
            input.args !== undefined
              ? [...input.args]
              : switched
                ? []
                : stored.args,
          env,
          url: "",
          headers: {},
        }
      : {
          command: "",
          args: [],
          env: {},
          url:
            input.url !== undefined
              ? input.url.trim()
              : switched
                ? ""
                : stored.url,
          headers,
        };

  try {
    db.update(mcpServers)
      .set({
        name,
        transport,
        config: JSON.stringify(config),
        enabled:
          input.enabled !== undefined
            ? input.enabled
              ? 1
              : 0
            : (row.enabled ?? 1),
        mode: input.mode !== undefined ? input.mode : (row.mode ?? "required"),
        updatedAt: nowIso(),
      })
      .where(and(eq(mcpServers.id, row.id), eq(mcpServers.userId, userId)))
      .run();
  } catch {
    return c.json({ error: "Another server already uses that name." }, 409);
  }

  const updated = readMcpServer(userId, row.id);

  if (!updated) {
    return c.json({ error: "Server not found" }, 404);
  }

  return c.json(toMcpSummary(updated));
});

integrationsRoute.delete("/mcp/:id", requireAuth, (c) => {
  const userId = c.get("user").id;

  if (!readMcpServer(userId, c.req.param("id"))) {
    return c.json({ error: "Server not found" }, 404);
  }

  db.delete(mcpServers)
    .where(
      and(eq(mcpServers.id, c.req.param("id")), eq(mcpServers.userId, userId)),
    )
    .run();

  return c.json({ deleted: true });
});
