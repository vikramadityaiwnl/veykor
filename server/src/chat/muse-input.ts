import type { ChatAttachment } from "@veykor/shared";
import { extractPdfText, extractSpreadsheetText } from "./document-text.js";
import { model } from "./model-catalog.js";

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
    if (attachment.kind === "video") {
      throw new Error(
        "Video input is not enabled for the installed native Muse model profile.",
      );
    }
    if (attachment.kind === "image") {
      if (
        !model(modelId).inputModalities?.includes("image") ||
        !match ||
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          match[1],
        )
      ) {
        throw new Error(
          "This model or image format does not support native image input.",
        );
      }
      input.push({ type: "image", mediaType: match[1], base64Data: match[2] });
      continue;
    }
    let content = attachment.text;
    if (match) {
      const bytes = Buffer.from(match[2], "base64");
      if (attachment.kind === "pdf") {
        content = (await extractPdfText(new Uint8Array(bytes))).text;
      } else if (attachment.kind === "spreadsheet") {
        content = extractSpreadsheetText(bytes);
      } else if (attachment.kind === "text") {
        content = bytes.toString("utf8");
      }
    }
    if (!content.trim()) {
      throw new Error(
        `Cannot extract text from ${attachment.name}. Attach a text file, PDF with selectable text, or spreadsheet.`,
      );
    }
    input.push({
      type: "text",
      text: `Attached document: ${attachment.name}\n${content.slice(0, 100_000)}`,
    });
  }
  return input;
}
