import type { ChatRequest } from "@veykor/shared";
import { validChatAttachments } from "./chat-history.js";

const permissionModes = [
  "promptUnmatched",
  "onRequest",
  "denyUnmatched",
  "allowAll",
];

export function validChatRequest(value: unknown): value is ChatRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const input = value as ChatRequest;
  return (
    input.providerId === "muse" &&
    typeof input.conversationId === "string" &&
    input.conversationId.length <= 100 &&
    typeof input.messageId === "string" &&
    input.messageId.length > 0 &&
    input.messageId.length <= 100 &&
    typeof input.modelId === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:@+/-]{0,199}$/.test(input.modelId) &&
    permissionModes.includes(input.permissionMode) &&
    input.systemPrompt === "" &&
    Array.isArray(input.messages) &&
    input.messages.length > 0 &&
    input.messages.length <= 200 &&
    input.messages.every(
      (message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.text === "string" &&
        message.text.length > 0 &&
        message.text.length <= 100_000 &&
        (message.attachments === undefined ||
          validChatAttachments(message.attachments)),
    ) &&
    input.messages.at(-1)?.role === "user"
  );
}
