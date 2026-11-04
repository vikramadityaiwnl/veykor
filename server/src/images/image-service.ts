import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  extractGeneratedImageIds,
  imagePaths,
  isGenerateImageTool,
  validateImagePrompt,
  validateImageSize,
} from "@veykor/shared";
import type {
  ChatHistoryItem,
  GeneratedImageArtifact,
  GeneratedImageStatus,
} from "@veykor/shared";
import { databasePath, db } from "../db/client.js";
import { generatedImages } from "../db/schema.js";
import { activeMuseTurn } from "../muse/chat-service.js";

export type ImageRow = typeof generatedImages.$inferSelect;

export class ImageFailure extends Error {}

const imageModel = "muse-image-1.0";

const generationsUrl = "https://api.meta.ai/v1/images/generations";

const requestTimeoutMs = 180000;

const maxImageBytes = 32 * 1024 * 1024;

const reuseWindowMs = 15 * 60 * 1000;

const chatLocks = new Map<string, Promise<void>>();

function nowIso(): string {
  return new Date().toISOString();
}

function ageMs(createdAt: string): number {
  const started = Date.parse(createdAt);

  return Number.isNaN(started) ? Number.MAX_SAFE_INTEGER : Date.now() - started;
}

async function withChatLock<T>(
  chatId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = chatLocks.get(chatId) ?? Promise.resolve();

  let release: () => void = () => {};

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);

  chatLocks.set(chatId, chained);

  try {
    await previous;

    return await work();
  } finally {
    release();

    if (chatLocks.get(chatId) === chained) {
      chatLocks.delete(chatId);
    }
  }
}

export function imageGenerationAvailable(): boolean {
  return (process.env["MODEL_API_KEY"] ?? "").trim() !== "";
}

export function imageStorageDir(): string {
  const root = resolve(dirname(databasePath), "generated-images");

  mkdirSync(root, { recursive: true });

  return root;
}

function extensionFor(mediaType: string): string {
  if (mediaType === "image/png") {
    return "png";
  }

  if (mediaType === "image/jpeg") {
    return "jpg";
  }

  return "webp";
}

function imageFilePath(id: string, mediaType: string): string {
  return resolve(imageStorageDir(), `${id}.${extensionFor(mediaType)}`);
}

export function newArtifactId(): string {
  return `img_${randomBytes(16).toString("hex")}`;
}

function parseStatus(value: string): GeneratedImageStatus {
  if (value === "completed" || value === "failed") {
    return value;
  }

  return "generating";
}

export function toArtifact(row: ImageRow): GeneratedImageArtifact {
  return {
    id: row.id,
    chatId: row.chatId,
    rootId: row.rootId,
    prompt: row.prompt,
    size: row.size,
    status: parseStatus(row.status),
    error: row.error,
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    turnId: row.turnId,
    toolItemId: row.toolItemId,
    url: imagePaths.view(row.id),
    downloadUrl: imagePaths.download(row.id),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseGenerationPayload(body: unknown): {
  base64: string;
  format: string;
} {
  const payload = record(body);
  const entries = Array.isArray(payload["data"]) ? payload["data"] : [];
  const base64 = text(record(entries[0])["b64_json"]);
  const format = text(payload["output_format"]) || "webp";

  if (base64 === "") {
    throw new ImageFailure(
      "The image service returned an invalid image. Try again shortly.",
    );
  }

  if (format !== "webp" && format !== "png" && format !== "jpeg") {
    throw new ImageFailure(
      "The image service returned an invalid image. Try again shortly.",
    );
  }

  return { base64, format };
}

export function sniffImageMediaType(bytes: Buffer): string {
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }

  return "";
}

export function upstreamErrorMessage(status: number, body: unknown): string {
  const error = record(record(body)["error"]);
  const message = text(error["message"]);
  const code = text(error["code"]);

  if (status === 401 || status === 403) {
    return "Image generation is not authorized. Check the server's Meta API key.";
  }

  if (status === 429) {
    return "Image generation is rate-limited right now. Try again shortly.";
  }

  if (code === "content_policy_violation") {
    return "That prompt was blocked by the image safety filter. Rephrase it and try again.";
  }

  if (status === 400 && message !== "") {
    return message.slice(0, 300);
  }

  if (status === 503) {
    return "The image service is busy. Try again shortly.";
  }

  if (status >= 500) {
    return "The image service failed. Try again shortly.";
  }

  return "Image generation failed. Try again shortly.";
}

function networkErrorMessage(cause: unknown): string {
  if (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { name?: unknown }).name === "TimeoutError"
  ) {
    return "Image generation timed out. Try again shortly.";
  }

  if (cause instanceof TypeError) {
    return "Unable to reach the image service. Try again shortly.";
  }

  return "Image generation failed. Try again shortly.";
}

async function requestImageBytes(input: {
  apiKey: string;
  prompt: string;
  size: string;
}): Promise<{ bytes: Buffer; mediaType: string }> {
  const payload: Record<string, unknown> = {
    model: imageModel,
    prompt: input.prompt,
    n: 1,
    response_format: "b64_json",
    output_format: "webp",
  };

  if (input.size !== "") {
    payload["size"] = input.size;
  }

  let response: Response;

  try {
    response = await fetch(generationsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (cause) {
    throw new ImageFailure(networkErrorMessage(cause));
  }

  let body: unknown;

  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new ImageFailure(
      "The image service returned an invalid image. Try again shortly.",
    );
  }

  if (!response.ok) {
    throw new ImageFailure(upstreamErrorMessage(response.status, body));
  }

  const parsed = parseGenerationPayload(body);

  let bytes: Buffer;

  try {
    bytes = Buffer.from(parsed.base64, "base64");
  } catch {
    throw new ImageFailure(
      "The image service returned an invalid image. Try again shortly.",
    );
  }

  if (bytes.length === 0 || bytes.length > maxImageBytes) {
    throw new ImageFailure(
      "The image service returned an invalid image. Try again shortly.",
    );
  }

  const mediaType = sniffImageMediaType(bytes);

  if (mediaType === "") {
    throw new ImageFailure(
      "The image service returned an invalid image. Try again shortly.",
    );
  }

  return { bytes, mediaType };
}

function findInvocation(
  chatId: string,
  callKey: string,
  prompt: string,
): ImageRow | undefined {
  return db
    .select()
    .from(generatedImages)
    .where(
      and(
        eq(generatedImages.chatId, chatId),
        eq(generatedImages.callKey, callKey),
        eq(generatedImages.prompt, prompt),
      ),
    )
    .orderBy(desc(generatedImages.createdAt))
    .limit(1)
    .get();
}

function insertGenerating(input: {
  chatId: string;
  rootId: string;
  userId: number;
  callKey: string;
  turnId: string;
  prompt: string;
  size: string;
}): ImageRow {
  const stamp = nowIso();

  return db
    .insert(generatedImages)
    .values({
      id: newArtifactId(),
      userId: input.userId,
      chatId: input.chatId,
      rootId: input.rootId,
      callKey: input.callKey,
      turnId: input.turnId,
      toolItemId: "",
      prompt: input.prompt,
      size: input.size,
      status: "generating",
      error: "",
      mediaType: "",
      byteSize: 0,
      createdAt: stamp,
      completedAt: "",
    })
    .returning()
    .get();
}

function markFailed(id: string, message: string): void {
  db.update(generatedImages)
    .set({ status: "failed", error: message, completedAt: nowIso() })
    .where(eq(generatedImages.id, id))
    .run();
}

function markCompleted(id: string, mediaType: string, byteSize: number): void {
  db.update(generatedImages)
    .set({
      status: "completed",
      error: "",
      mediaType,
      byteSize,
      completedAt: nowIso(),
    })
    .where(eq(generatedImages.id, id))
    .run();
}

function readRow(id: string): ImageRow | undefined {
  return db
    .select()
    .from(generatedImages)
    .where(eq(generatedImages.id, id))
    .get();
}

export async function generateChatImage(input: {
  userId: number;
  chatId: string;
  rootId: string;
  museSessionId: string;
  prompt: string;
  size: string;
  jsonRpcId: string;
}): Promise<{ artifact: GeneratedImageArtifact; reused: boolean }> {
  const promptError = validateImagePrompt(input.prompt);
  const sizeError = promptError === "" ? validateImageSize(input.size) : "";

  if (promptError !== "") {
    throw new ImageFailure(promptError);
  }

  if (sizeError !== "") {
    throw new ImageFailure(sizeError);
  }

  const apiKey = (process.env["MODEL_API_KEY"] ?? "").trim();

  if (apiKey === "") {
    throw new ImageFailure(
      "Image generation is not configured on this server.",
    );
  }

  const callKey = `${input.chatId}:${input.jsonRpcId}`;

  const claimed = await withChatLock(input.chatId, async () => {
    const existing = findInvocation(input.chatId, callKey, input.prompt);

    if (existing && parseStatus(existing.status) === "generating") {
      if (ageMs(existing.createdAt) < reuseWindowMs) {
        return { row: existing, reused: true };
      }

      markFailed(
        existing.id,
        "Image generation was interrupted. Ask for the image again.",
      );
    }

    if (
      existing &&
      parseStatus(existing.status) === "completed" &&
      ageMs(existing.createdAt) < reuseWindowMs
    ) {
      return { row: existing, reused: true };
    }

    return {
      row: insertGenerating({
        chatId: input.chatId,
        rootId: input.rootId,
        userId: input.userId,
        callKey,
        turnId: activeMuseTurn(input.museSessionId),
        prompt: input.prompt,
        size: input.size.trim(),
      }),
      reused: false,
    };
  });

  if (claimed.reused) {
    return { artifact: toArtifact(claimed.row), reused: true };
  }

  try {
    const rendered = await requestImageBytes({
      apiKey,
      prompt: input.prompt,
      size: input.size.trim(),
    });

    writeFileSync(
      imageFilePath(claimed.row.id, rendered.mediaType),
      rendered.bytes,
    );
    markCompleted(claimed.row.id, rendered.mediaType, rendered.bytes.length);

    return { artifact: toArtifact(readRow(claimed.row.id)!), reused: false };
  } catch (cause) {
    const message =
      cause instanceof ImageFailure
        ? cause.message
        : "Image generation failed. Try again shortly.";

    markFailed(claimed.row.id, message);

    throw new ImageFailure(message);
  }
}

export function backfillToolItems(
  chatId: string,
  items: Array<ChatHistoryItem>,
): void {
  for (const item of items) {
    if (!isGenerateImageTool(item.tool)) {
      continue;
    }

    for (const id of extractGeneratedImageIds(item.visibleOutput)) {
      const row = readRow(id);

      if (!row || row.chatId !== chatId || row.toolItemId !== "") {
        continue;
      }

      db.update(generatedImages)
        .set({
          toolItemId: item.itemId,
          turnId:
            row.turnId !== "" || item.turnId === null
              ? row.turnId
              : item.turnId,
        })
        .where(eq(generatedImages.id, id))
        .run();
    }
  }
}

export function listChatImages(chatId: string): Array<ImageRow> {
  return db
    .select()
    .from(generatedImages)
    .where(eq(generatedImages.chatId, chatId))
    .orderBy(asc(generatedImages.createdAt), asc(sql`generated_images.rowid`))
    .all();
}

export function generatedImagesForChat(
  chatId: string,
  items: Array<ChatHistoryItem>,
): Array<GeneratedImageArtifact> {
  backfillToolItems(chatId, items);

  return listChatImages(chatId).map(toArtifact);
}

export function readOwnedImage(
  userId: number,
  id: string,
): ImageRow | undefined {
  const row = readRow(id);

  if (!row || row.userId !== userId) {
    return undefined;
  }

  return row;
}

export function readImageBytes(row: ImageRow): Buffer | null {
  if (parseStatus(row.status) !== "completed" || row.mediaType === "") {
    return null;
  }

  try {
    return readFileSync(imageFilePath(row.id, row.mediaType));
  } catch {
    return null;
  }
}

export function failInterruptedGenerations(): void {
  db.update(generatedImages)
    .set({
      status: "failed",
      error: "The server restarted before this image finished.",
      completedAt: nowIso(),
    })
    .where(eq(generatedImages.status, "generating"))
    .run();
}

export function deleteChatImages(chatIds: Array<string>): void {
  if (chatIds.length === 0) {
    return;
  }

  const rows = db
    .select()
    .from(generatedImages)
    .where(inArray(generatedImages.chatId, chatIds))
    .all();

  for (const row of rows) {
    if (row.mediaType === "") {
      continue;
    }

    try {
      rmSync(imageFilePath(row.id, row.mediaType), { force: true });
    } catch {
      // Best effort; the database row is still removed below.
    }
  }

  db.delete(generatedImages)
    .where(inArray(generatedImages.chatId, chatIds))
    .run();
}
