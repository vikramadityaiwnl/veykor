import type { ChatAttachment } from "@veykor/shared";

export type AttachmentKind = ChatAttachment["kind"];

export function getAttachmentKind(
  mimeType: string,
  name: string,
): AttachmentKind {
  const mime = mimeType.toLowerCase();
  const lower = name.toLowerCase();

  if (
    ["video/mp4", "video/quicktime"].includes(mime) ||
    /\.(mp4|mov)$/.test(lower)
  ) {
    return "video";
  }

  if (mime.startsWith("image/")) {
    return "image";
  }

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    mime === "text/csv" ||
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "application/vnd.ms-excel" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    /\.(xlsx?|ods|numbers|csv)$/.test(lower)
  ) {
    return "spreadsheet";
  }

  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/typescript" ||
    /\.(txt|md|markdown|csv|json|ya?ml|tsx?|jsx?|py|css|html|xml|log|sql|toml|ini|env)$/.test(
      lower,
    )
  ) {
    return "text";
  }

  return "document";
}

export function isImageFile(file: { type: string; name: string }): boolean {
  return getAttachmentKind(file.type, file.name) === "image";
}

export function openInNewTab(dataUrl: string): void {
  if (!dataUrl) {
    return;
  }

  const url = dataUrl.startsWith("data:")
    ? URL.createObjectURL(dataUrlToBlob(dataUrl))
    : dataUrl;

  window.open(url, "_blank", "noopener,noreferrer");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl);

  if (!match) {
    throw new Error("Unable to read file");
  }

  const mimeType = match[1] || "";
  const encoded = match[3] || "";

  if (match[2]) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
  }

  return new Blob([decodeURIComponent(encoded)], { type: mimeType });
}
