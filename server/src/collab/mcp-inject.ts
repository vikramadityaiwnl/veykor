import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dbPath } from "../db/client.js";
import type { ConversationMetadata } from "../chat/conversations.js";
import type { SessionMcpServerConfig } from "../mcp/session-config.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, "..", "..");

export function collabMcpEntry(
  userId: number,
  conversationId: string,
  metadata: ConversationMetadata,
): Record<string, SessionMcpServerConfig> | undefined {
  if (!metadata.projectId || metadata.providerId !== "muse") {
    return undefined;
  }

  const distEntry = resolve(serverRoot, "dist", "collab", "mcp-server.js");
  const srcEntry = resolve(serverRoot, "src", "collab", "mcp-server.ts");
  const tsxCli = resolve(serverRoot, "node_modules", "tsx", "dist", "cli.mjs");

  const args = existsSync(distEntry)
    ? [distEntry]
    : existsSync(tsxCli) && existsSync(srcEntry)
      ? [tsxCli, srcEntry]
      : undefined;

  if (!args) {
    return undefined;
  }

  const env: Record<string, string> = {
    VEYKOR_USER_ID: String(userId),
    VEYKOR_CONVERSATION_ID: conversationId,
    DATABASE_URL: resolve(dbPath),
  };

  for (const key of ["PATH", "HOME", "MUSE_BIN", "OPENCODE_BIN"]) {
    const value = process.env[key];

    if (value) {
      env[key] = value;
    }
  }

  return {
    "veykor-collab": {
      transport: "stdio",
      command: process.execPath,
      args,
      env,
      mode: "required",
    },
  };
}
