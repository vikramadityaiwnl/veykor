import type { ChatAttachment } from "@veykor/shared";

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
        ["image", "video", "pdf", "spreadsheet", "text", "document"].includes(
          attachment.kind,
        ) &&
        typeof attachment.dataUrl === "string" &&
        attachment.dataUrl.length <= 15_000_000 &&
        typeof attachment.text === "string" &&
        attachment.text.length <= 100_000,
    )
  );
}
