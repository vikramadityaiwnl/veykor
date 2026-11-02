import type { CreateMcpServerInput, McpServer, McpTransport } from "@veykor/shared";
import { detectedFingerprint } from "./detect.js";

export interface SessionMcpSource {
  name: string;
  enabled: boolean;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}

export type SessionMcpServerConfig =
  | {
      transport: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      mode?: "required" | "optional";
    }
  | {
      transport: "streamableHttp";
      url: string;
      headers?: Record<string, string>;
      mode?: "required" | "optional";
    };

export function mergeSessionMcpSources(
  managed: McpServer[],
  detected: CreateMcpServerInput[],
): SessionMcpSource[] {
  const seen = new Set(managed.map(detectedFingerprint));

  const sources: SessionMcpSource[] = [...managed];

  for (const entry of detected) {
    if (seen.has(detectedFingerprint(entry))) {
      continue;
    }

    seen.add(detectedFingerprint(entry));
    sources.push({ ...entry, enabled: true });
  }

  return sources;
}

function isChromeDevtoolsServer(server: SessionMcpSource): boolean {
  return [server.command, ...server.args].some((entry) =>
    entry.includes("chrome-devtools-mcp"),
  );
}

function hasWorkspaceRoot(args: string[]): boolean {
  return args.some(
    (entry) =>
      entry === "--workspace" ||
      entry.startsWith("--workspace=") ||
      entry === "--filesystemRoot" ||
      entry.startsWith("--filesystemRoot=") ||
      entry === "--allowUnrestrictedPaths" ||
      entry.startsWith("--allowUnrestrictedPaths="),
  );
}

function sessionArgs(
  server: SessionMcpSource,
  workspaceRoot: string,
): string[] {
  const args = [...server.args];

  if (
    workspaceRoot &&
    isChromeDevtoolsServer(server) &&
    !hasWorkspaceRoot(args)
  ) {
    args.push(`--workspace=${workspaceRoot}`);
  }

  return args;
}

export function isSessionMcpNameConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");

  return /session MCP server name conflicts/i.test(message);
}

export function toSessionMcpServers(
  servers: SessionMcpSource[],
  workspaceRoot = "",
): Record<string, SessionMcpServerConfig> | undefined {
  const result: Record<string, SessionMcpServerConfig> = {};

  for (const server of servers) {
    if (!server.enabled) {
      continue;
    }

    const name = server.name.trim();

    if (!name) {
      continue;
    }

    let key = name;
    let suffix = 2;

    while (result[key]) {
      key = `${name} (${suffix})`;
      suffix += 1;
    }

    if (server.transport === "stdio") {
      const command = server.command.trim();

      if (!command) {
        continue;
      }

      const args = sessionArgs(server, workspaceRoot);

      result[key] = {
        transport: "stdio",
        command,
        ...(args.length > 0 ? { args } : {}),
        ...(Object.keys(server.env).length > 0
          ? { env: { ...server.env } }
          : {}),
        mode: "optional",
      };
    } else if (server.transport === "http") {
      const url = server.url.trim();

      if (!url) {
        continue;
      }

      result[key] = {
        transport: "streamableHttp",
        url,
        ...(Object.keys(server.headers).length > 0
          ? { headers: { ...server.headers } }
          : {}),
        mode: "optional",
      };
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
