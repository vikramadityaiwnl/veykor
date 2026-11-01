import type { ChatAttachment, ChatRequest } from "@veykor/shared";
import { isReasoningEffort } from "./reasoning-effort.js";

export function validChatAttachments(
  value: unknown,
): value is ChatAttachment[] {
  return (
    Array.isArray(value) &&
    value.length <= 5 &&
    value.every(
      (attachment) =>
        attachment &&
        typeof attachment.id === "string" &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(attachment.id) &&
        typeof attachment.name === "string" &&
        attachment.name.length > 0 &&
        attachment.name.length <= 255 &&
        typeof attachment.mimeType === "string" &&
        attachment.mimeType.length <= 200 &&
        Number.isSafeInteger(attachment.size) &&
        attachment.size >= 0 &&
        attachment.size <= 10_000_000 &&
        attachment.kind === "image" &&
        typeof attachment.dataUrl === "string" &&
        attachment.dataUrl.length <= 15_000_000 &&
        typeof attachment.text === "string" &&
        attachment.text.length <= 100_000,
    )
  );
}

export function hasNonImageAttachment(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const messages = (value as ChatRequest).messages;

  return (
    Array.isArray(messages) &&
    messages.some(
      (message) =>
        Array.isArray(message?.attachments) &&
        message.attachments.some((attachment) => attachment?.kind !== "image"),
    )
  );
}

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
    isReasoningEffort(input.reasoningEffort) &&
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
