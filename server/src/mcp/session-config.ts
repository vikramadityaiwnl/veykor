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

export function toSessionMcpServers(
  servers: SessionMcpSource[],
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

      result[key] = {
        transport: "stdio",
        command,
        ...(server.args.length > 0 ? { args: [...server.args] } : {}),
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
