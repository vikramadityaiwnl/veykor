import type { ConversationMetadata } from "../../chat/conversations.js";
import type { OpenCodeConnection } from "./connection.js";
import { permissionRules } from "./permissions.js";

export async function newChat(
  connection: OpenCodeConnection,
  metadata: ConversationMetadata,
  folder: string,
): Promise<string> {
  const result = await connection.request("POST", "/api/session", {
    title: metadata.title,
    location: { directory: folder },
    permissions: permissionRules(metadata.permissionMode),
  });

  if (typeof result.data?.id !== "string") {
    throw new Error("OpenCode did not return a session ID");
  }

  return result.data.id;
}
