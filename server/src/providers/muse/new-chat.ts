import type { Session } from "./types.js";
import type { spawnMuse } from "./connection.js";
import type { ConversationMetadata } from "../../chat/conversations.js";
import type { openNativeSession } from "./resume.js";

type Muse = Awaited<ReturnType<typeof spawnMuse>>;

export async function newChat(
  muse: Muse,
  folder: string,
  metadata: ConversationMetadata,
  options: Parameters<typeof openNativeSession>[3],
): Promise<Session> {
  return muse.startSession({
    workspaceRoot: folder,
    modelId: metadata.modelId,
    approvalMode: metadata.permissionMode || "promptUnmatched",
    ...(options.mcpServers
      ? { config: { mcpServers: options.mcpServers } }
      : {}),
    onApproval: options.onApproval,
    onApprovalError: options.onApprovalError,
  });
}
