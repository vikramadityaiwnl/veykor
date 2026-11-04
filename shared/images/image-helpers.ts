export const generateImageToolName = "generate_image";

export const maxImagePromptLength = 4000;

export const imagePaths = {
  meta: (id: string) => `/api/images/${id}`,
  view: (id: string) => `/api/images/${id}/view`,
  download: (id: string) => `/api/images/${id}/download`,
} as const;

const generatedImageIdPattern = /\bimg_[0-9a-f]{32}\b/g;

export function isGenerateImageTool(tool: string): boolean {
  return tool.includes(generateImageToolName);
}

export function extractGeneratedImageIds(text: string): Array<string> {
  const found = text.match(generatedImageIdPattern);

  return found === null ? [] : [...new Set(found)];
}

export function isGeneratedImageUrl(value: string): boolean {
  return value.startsWith("/api/images/") || value.includes("/api/images/img_");
}

export function validateImagePrompt(prompt: string): string {
  if (prompt.trim() === "") {
    return "Describe the image to generate.";
  }

  if (prompt.length > maxImagePromptLength) {
    return `Keep the prompt under ${maxImagePromptLength} characters.`;
  }

  return "";
}

export function validateImageSize(size: string): string {
  if (size === "") {
    return "";
  }

  const match = /^(\d+)x(\d+)$/i.exec(size.trim());

  if (!match) {
    return 'Use a "WxH" size such as "1792x1024".';
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 8192 ||
    height > 8192
  ) {
    return 'Use a "WxH" size such as "1792x1024".';
  }

  const ratio = width / height;

  if (ratio > 16 || ratio < 1 / 16) {
    return "Keep the aspect ratio within 16:1.";
  }

  return "";
}

export const generateImageAgentGuidance = [
  "Use the generate_image MCP tool when the user asks for an image.",
  "Describe the request faithfully in the prompt; pass size only when the",
  "user asked for dimensions or orientation.",
  "The image is saved and displayed in the chat automatically. Describe the",
  "result briefly without pasting its URL or a Markdown image.",
  "Report generation failures truthfully without inventing an image.",
].join(" ");
