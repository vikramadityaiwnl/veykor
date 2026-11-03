import { newChat } from "./new-chat.js";
import type { Session } from "./types.js";
import type { spawnMuse } from "./connection.js";
import type { ConversationMetadata } from "../../chat/conversations.js";
import type { SessionMcpServerConfig } from "../../mcp/session-config.js";

type Muse = Awaited<ReturnType<typeof spawnMuse>>;

export async function openNativeSession(
  muse: Muse,
  folder: string,
  metadata: ConversationMetadata,
  options: {
    onApproval: Parameters<Session["onApproval"]>[0];
    onApprovalError: Parameters<Session["onApprovalError"]>[0];
    mcpServers: Record<string, SessionMcpServerConfig> | undefined;
  },
): Promise<Session> {
  if (metadata.nativeSessionId) {
    return muse.resumeSession({
      sessionId: metadata.nativeSessionId,
      ...(options.mcpServers
        ? { config: { mcpServers: options.mcpServers } }
        : {}),
      onApproval: options.onApproval,
      onApprovalError: options.onApprovalError,
    });
  }

  return newChat(muse, folder, metadata, options);
}
