import { Hono } from "hono";
import { generateImageToolName, imagePaths } from "@veykor/shared";
import type { GenerateImageToolResult } from "@veykor/shared";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import type { TeamChat } from "../teams/team-runtime.js";
import {
  generateChatImage,
  readImageBytes,
  readOwnedImage,
  toArtifact,
} from "./image-service.js";

const artifactIdPattern = /^img_[0-9a-f]{32}$/;

function downloadFilename(id: string, mediaType: string): string {
  const extension =
    mediaType === "image/png"
      ? "png"
      : mediaType === "image/jpeg"
        ? "jpg"
        : "webp";

  return `veykor-image-${id.slice(4, 12)}.${extension}`;
}

export const imageRoute = new Hono<AuthEnv>();

imageRoute.get("/:id", requireAuth, (c) => {
  const id = c.req.param("id");

  if (!artifactIdPattern.test(id)) {
    return c.json({ error: "Image not found." }, 404);
  }

  const row = readOwnedImage(c.get("user").id, id);

  if (!row) {
    return c.json({ error: "Image not found." }, 404);
  }

  return c.json(toArtifact(row));
});

imageRoute.get("/:id/view", requireAuth, (c) => {
  const id = c.req.param("id");

  if (!artifactIdPattern.test(id)) {
    return c.json({ error: "Image not found." }, 404);
  }

  const row = readOwnedImage(c.get("user").id, id);
  const bytes = row ? readImageBytes(row) : null;

  if (!row || !bytes) {
    return c.json({ error: "Image not found." }, 404);
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mediaType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});

imageRoute.get("/:id/download", requireAuth, (c) => {
  const id = c.req.param("id");

  if (!artifactIdPattern.test(id)) {
    return c.json({ error: "Image not found." }, 404);
  }

  const row = readOwnedImage(c.get("user").id, id);
  const bytes = row ? readImageBytes(row) : null;

  if (!row || !bytes) {
    return c.json({ error: "Image not found." }, 404);
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mediaType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${downloadFilename(row.id, row.mediaType)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});

export const generateImageToolDefinition = {
  name: generateImageToolName,
  description:
    "Generate an image from a text description. The image is saved and displayed in the chat automatically; describe the result briefly without pasting its URL. Report failures truthfully without inventing an image.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The image description, up to 4000 characters.",
      },
      size: {
        type: "string",
        description:
          'Optional "WxH" size such as "1792x1024". Sets the aspect ratio, not exact pixels. Omit for the default.',
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
};

export async function callGenerateImageTool(
  row: TeamChat,
  args: Record<string, unknown>,
  jsonRpcId: string,
): Promise<GenerateImageToolResult> {
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  const size = typeof args.size === "string" ? args.size : "";

  const generated = await generateChatImage({
    userId: row.userId,
    chatId: row.id,
    rootId: row.parentChatId || row.id,
    museSessionId: row.museSessionId,
    prompt,
    size,
    jsonRpcId,
  });

  return {
    artifactId: generated.artifact.id,
    url: imagePaths.view(generated.artifact.id),
    downloadUrl: imagePaths.download(generated.artifact.id),
    mediaType: generated.artifact.mediaType,
    byteSize: generated.artifact.byteSize,
    message:
      generated.artifact.status === "completed"
        ? "Image saved. It is shown inline in the chat."
        : "Image generation is already running for this request.",
  };
}
