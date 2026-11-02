import type { ChatAttachment } from "@veykor/shared";
import { model } from "./models.js";

export async function nativeInput(
  attachments: ChatAttachment[],
  text: string,
  modelId: string,
) {
  const input: {
    type: "text" | "image";
    text?: string;
    base64Data?: string;
    mediaType?: string;
  }[] = [{ type: "text", text }];
  for (const attachment of attachments) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(
      attachment.dataUrl,
    );
    if (
      attachment.kind !== "image" ||
      !model(modelId).inputModalities?.includes("image") ||
      !match ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(match[1])
    ) {
      throw new Error("Only image files can be attached for now.");
    }
    input.push({ type: "image", mediaType: match[1], base64Data: match[2] });
  }
  return input;
}
