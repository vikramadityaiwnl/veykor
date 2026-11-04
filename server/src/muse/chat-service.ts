import { userMessageText } from "./user-message-text.js";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import type { SessionMcpServerConfig } from "@muse-code/sdk/dist/src/msp.js";
import type {
  ChatApprovalRequest,
  ChatDetail,
  ChatHistoryItem,
  ChatModelCatalog,
  ChatModelOption,
  ChatPermission,
  ChatSummary,
  ChatTurnEvent,
} from "@veykor/shared";
import { extractFilePathCandidates, isGenerateImageTool } from "@veykor/shared";
import { readTurnDurations } from "./turn-durations.js";
import { museHost } from "./muse-host.js";
import type { MuseNotification } from "./muse-host.js";
import { workspaceFor } from "./workspace.js";

export type TurnEvent = ChatTurnEvent;

const effortSettings = new Map<string, string>();

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function list(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}

export function permissionToApprovalMode(permission: ChatPermission): string {
  if (permission === "full-access") {
    return "allowAll";
  }

  if (permission === "approved") {
    return "promptUnmatched";
  }

  return "denyUnmatched";
}

export function approvalModeToPermission(mode: string): ChatPermission {
  if (mode === "allowAll") {
    return "full-access";
  }

  if (mode === "promptUnmatched" || mode === "onRequest") {
    return "approved";
  }

  return "read-only";
}

function displayLabel(value: unknown): string {
  const entry = record(value);

  const label = text(entry["label"]);
  const title = text(entry["title"]);

  return label !== "" ? label : title;
}

function subjectTitle(subject: Record<string, unknown>): string {
  const kind = text(subject["kind"]);

  for (const key of ["title", "label", "command", "path", "url"]) {
    const value = text(subject[key]);

    if (value !== "") {
      return value;
    }
  }

  return kind !== "" ? kind : "Tool call";
}

export function toHistoryItem(value: unknown): ChatHistoryItem {
  const item = record(value);
  const summary = list(item["summary"]).filter(
    (entry): entry is string => typeof entry === "string",
  );

  const attachments = list(item["attachments"]).map((entry) => ({
    mediaType: text(record(entry)["mediaType"]),
  }));

  const turnId = item["turnId"];
  const kind = text(item["kind"]);

  return {
    itemId: text(item["itemId"]),
    kind,
    status: text(item["status"]),
    turnId: typeof turnId === "string" ? turnId : null,
    text:
      kind === "userMessage"
        ? userMessageText(text(item["text"]), item["displayText"])
        : text(item["text"]),
    summary,
    tool: text(item["tool"]),
    displayLabel: displayLabel(item["displayLabel"]),
    visibleOutput: text(item["visibleOutput"]),
    args: text(item["args"]),
    recordedAt: text(item["recordedAt"]),
    attachments,
  };
}

export function restoreHistoryItems(values: Array<unknown>): ChatHistoryItem[] {
  return values.map(toHistoryItem);
}

export function toApproval(value: unknown): ChatApprovalRequest {
  const approval = record(value);
  const requirement = record(approval["currentRequirementId"]);
  const subject = record(approval["subject"]);

  const sourceIndex = requirement["sourceIndex"];

  const choices = list(approval["availableChoices"]).map((entry) => {
    const choice = record(entry);

    return {
      choiceId: text(choice["choiceId"]),
      label: text(choice["label"]),
      decision: text(choice["decision"]),
      scope: text(choice["scope"]),
      acceptsFeedback: choice["acceptsFeedback"] === true,
      rulePreview: text(choice["rulePreview"]),
    };
  });

  return {
    approvalId: text(approval["approvalId"]),
    sessionId: text(approval["sessionId"]),
    turnId: text(approval["turnId"]),
    itemId: text(approval["itemId"]),
    toolName: text(approval["toolName"]),
    rawArgs: text(approval["rawArgs"]),
    subjectKind: text(subject["kind"]),
    subjectTitle: subjectTitle(subject),
    requirementIndex: typeof sourceIndex === "number" ? sourceIndex : 0,
    choices,
  };
}

function toModelOption(value: unknown): ChatModelOption {
  const model = record(value);
  const cost = record(model["cost"]);
  const hasCost = model["cost"] !== null && model["cost"] !== undefined;

  const variants = list(model["variants"]).filter(
    (entry): entry is string => typeof entry === "string",
  );

  return {
    modelId: text(model["modelId"]),
    providerId: text(model["providerId"]),
    displayLabel:
      text(model["displayLabel"]) !== ""
        ? text(model["displayLabel"])
        : text(model["modelId"]),
    description: text(model["description"]),
    cost: hasCost
      ? {
          input: text(cost["input"]),
          cached: text(cost["cached"]),
          output: text(cost["output"]),
          currency:
            text(cost["currency"]) !== "" ? text(cost["currency"]) : "USD",
        }
      : null,
    variants,
    defaultReasoningEffort: text(model["defaultReasoningEffort"]),
    isActive: model["isActive"] === true,
    isDefault: model["isDefault"] === true,
  };
}

export async function startMuseSession(
  userId: number,
  workspaceRoot = workspaceFor(userId),
  options: { mcpServers?: Record<string, SessionMcpServerConfig> } = {},
): Promise<{ sessionId: string }> {
  const connection = await museHost.connection();

  const mcpServers = options.mcpServers ?? {};
  const params: Record<string, unknown> = { workspaceRoot };

  if (Object.keys(mcpServers).length > 0) {
    if (!(await museHost.supportsSessionMcp())) {
      throw new Error(
        "This Muse version does not support session MCP servers.",
      );
    }

    params["config"] = { mcpServers };
  }

  const result = await connection.command("session/start", params);

  const session = record(result["session"]);

  const sessionId = text(session["sessionId"]);

  if (sessionId === "") {
    throw new Error("Muse did not return a session id.");
  }

  await connection.command("session/setApprovalMode", {
    sessionId,
    mode: permissionToApprovalMode("read-only"),
  });

  return { sessionId };
}

interface TurnOutcome {
  terminal: string;
  error: string;
  durationMs: number;
}

export interface NativeTodoSnapshot {
  items: unknown[];
  revision: number;
  sourceTool: string;
}

interface ActiveTurn {
  turnId: string;
  startedAt: number;
  previousTurnIds: Set<string>;
  retarget?: (turnId: string) => Promise<void>;
  finish?: (outcome: TurnOutcome) => void;
}

function turnOutcome(params: Record<string, unknown>): TurnOutcome {
  const failure = record(params["error"]);
  const duration = params["durationMs"];

  return {
    terminal: text(params["terminal"]),
    error: text(failure["message"]) || text(params["reason"]),
    durationMs: typeof duration === "number" && duration > 0 ? duration : 0,
  };
}

function nativeTodos(value: Record<string, unknown>): NativeTodoSnapshot {
  return {
    items: list(value["items"] ?? value["todos"]),
    revision: typeof value["revision"] === "number" ? value["revision"] : 0,
    sourceTool: text(value["sourceTool"]),
  };
}

function previewOutputRef(
  payload: unknown,
  item: ChatHistoryItem,
): { refId: string; mediaType: string } | null {
  if (item.kind !== "toolCall" || isGenerateImageTool(item.tool)) {
    return null;
  }

  const raw = record(payload);
  const ref = record(raw["outputRef"]);
  const refId = text(ref["id"]);
  const imageContent = list(raw["modelVisibleContent"])
    .map(record)
    .find((content) => content["type"] === "image");
  const mediaType =
    text(ref["mediaType"]) ||
    text(imageContent?.["mediaType"]) ||
    text(imageContent?.["mimeType"]);
  const availability = text(ref["availability"]);

  if (refId === "" || !mediaType.startsWith("image/")) {
    return null;
  }

  if (availability !== "" && availability !== "available") {
    return null;
  }

  return { refId, mediaType };
}

function inlinePreview(
  payload: unknown,
): { mediaType: string; base64Data: string } | null {
  const image = list(record(payload)["modelVisibleContent"])
    .map(record)
    .find((content) => content["type"] === "image");

  if (image === undefined) {
    return null;
  }

  let mediaType = text(image["mediaType"]) || text(image["mimeType"]);
  let base64Data = text(image["base64Data"]) || text(image["data"]);

  if (base64Data.startsWith("data:")) {
    const match = base64Data.match(/^data:(image\/[\w.+-]+);base64,(.*)$/s);

    if (match === null) {
      return null;
    }

    mediaType = mediaType || match[1] || "";
    base64Data = match[2] || "";
  }

  return mediaType.startsWith("image/") && base64Data !== ""
    ? { mediaType, base64Data }
    : null;
}

function previewFilePaths(payload: unknown, item: ChatHistoryItem): string[] {
  const raw = record(payload);

  return extractFilePathCandidates(
    raw["args"] ?? raw["arguments"] ?? item.args,
    item.visibleOutput,
    raw["visibleOutput"],
  );
}

function previewAssetPaths(itemId: string, previewRoot: string): string[] {
  const key = createHash("sha256").update(itemId).digest("hex");

  return ["png", "jpg", "webp", "gif", "bmp", "avif"].map((extension) =>
    resolve(previewRoot, "tool-preview-" + key + "." + extension),
  );
}

function previewExtension(mediaType: string): string {
  switch (mediaType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/bmp":
      return "bmp";
    case "image/avif":
      return "avif";
    default:
      return "";
  }
}

async function persistPreviewOutput(
  itemId: string,
  mediaType: string,
  base64Data: string,
  previewRoot: string,
): Promise<void> {
  const extension = previewExtension(mediaType);
  const bytes = Buffer.from(base64Data, "base64");

  if (
    extension === "" ||
    bytes.byteLength === 0 ||
    bytes.byteLength > 6 * 1024 * 1024
  ) {
    return;
  }

  const key = createHash("sha256").update(itemId).digest("hex");

  try {
    await mkdir(previewRoot, { recursive: true });
    await writeFile(
      resolve(previewRoot, "tool-preview-" + key + "." + extension),
      bytes,
    );
  } catch {
    return;
  }
}

async function readPreviewFile(
  filePath: string,
  previewRoot: string,
): Promise<{ mediaType: string; base64Data: string } | null> {
  try {
    const [root, resolvedPath] = await Promise.all([
      realpath(previewRoot),
      realpath(
        isAbsolute(filePath) ? filePath : resolve(previewRoot, filePath),
      ),
    ]);
    const relativePath = relative(root, resolvedPath);

    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      return null;
    }

    const bytes = await readFile(resolvedPath);

    if (bytes.byteLength === 0 || bytes.byteLength > 6 * 1024 * 1024) {
      return null;
    }

    let mediaType = "";

    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      mediaType = "image/png";
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      mediaType = "image/jpeg";
    } else if (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    ) {
      mediaType = "image/webp";
    } else if (/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) {
      mediaType = "image/gif";
    } else if (bytes.toString("ascii", 0, 2) === "BM") {
      mediaType = "image/bmp";
    } else if (
      bytes.toString("ascii", 4, 8) === "ftyp" &&
      ["avif", "avis"].includes(bytes.toString("ascii", 8, 12))
    ) {
      mediaType = "image/avif";
    }

    if (mediaType === "") {
      return null;
    }

    return { mediaType, base64Data: bytes.toString("base64") };
  } catch {
    return null;
  }
}

function mediaTypeFromBytes(bytes: Buffer): string {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  if (/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) {
    return "image/gif";
  }

  if (bytes.toString("ascii", 0, 2) === "BM") {
    return "image/bmp";
  }

  if (
    bytes.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(bytes.toString("ascii", 8, 12))
  ) {
    return "image/avif";
  }

  if (bytes.toString("ascii", 4, 8) === "ftyp") {
    return "video/mp4";
  }

  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return "video/webm";
  }

  if (bytes.toString("ascii", 0, 4) === "OggS") {
    return "video/ogg";
  }

  return "";
}

export async function readChatFileForItem(
  item: ChatHistoryItem,
  previewRoot: string,
  fileIndex: number,
): Promise<{ bytes: Buffer; fileName: string; mediaType: string } | null> {
  if (
    item.kind !== "toolCall" ||
    !Number.isInteger(fileIndex) ||
    fileIndex < 0
  ) {
    return null;
  }

  const filePath = extractFilePathCandidates(item.args, item.visibleOutput)[
    fileIndex
  ];

  if (filePath === undefined) {
    return null;
  }

  try {
    const [root, resolvedPath] = await Promise.all([
      realpath(previewRoot),
      realpath(
        isAbsolute(filePath) ? filePath : resolve(previewRoot, filePath),
      ),
    ]);
    const relativePath = relative(root, resolvedPath);

    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      return null;
    }

    const bytes = await readFile(resolvedPath);

    if (bytes.byteLength === 0 || bytes.byteLength > 100 * 1024 * 1024) {
      return null;
    }

    const mediaType = mediaTypeFromBytes(bytes);

    if (mediaType === "") {
      return null;
    }

    return { bytes, fileName: basename(resolvedPath), mediaType };
  } catch {
    return null;
  }
}

export async function readPreviewForItem(
  item: ChatHistoryItem,
  previewRoot: string,
): Promise<{ mediaType: string; base64Data: string } | null> {
  if (item.kind !== "toolCall") {
    return null;
  }

  const candidates = [
    ...previewAssetPaths(item.itemId, previewRoot),
    ...previewFilePaths({ args: item.args }, item),
  ];

  for (const filePath of candidates) {
    const preview = await readPreviewFile(filePath, previewRoot);

    if (preview !== null) {
      return preview;
    }
  }

  return null;
}

const activeTurns = new Map<string, ActiveTurn>();

export function activeMuseTurn(museSessionId: string): string {
  return activeTurns.get(museSessionId)?.turnId ?? "";
}

export function isActiveMuseTurn(
  museSessionId: string,
  turnId: string,
): boolean {
  const active = activeTurns.get(museSessionId);

  return (
    active !== undefined &&
    (active.turnId === turnId || active.previousTurnIds.has(turnId))
  );
}

export function isMuseTurnRunning(museSessionId: string): boolean {
  return activeTurns.has(museSessionId);
}

export async function readMuseChat(
  chat: ChatSummary,
  options: {
    mcpServers?: Record<string, SessionMcpServerConfig>;
    onTodoSnapshot?: (snapshot: NativeTodoSnapshot) => void;
  } = {},
): Promise<
  Omit<
    ChatDetail,
    "chat" | "pendingQuestions" | "recentQuestions" | "generatedImages"
  >
> {
  const connection = await museHost.connection();

  const mcpServers = options.mcpServers ?? {};
  const params: Record<string, unknown> = {
    sessionId: chat.museSessionId,
    excludeItems: false,
  };

  if (Object.keys(mcpServers).length > 0) {
    params["config"] = { mcpServers };
  }

  const resumed = await connection.command("session/resume", params);

  const session = record(resumed["session"]);
  const history = record(resumed["history"]);
  const snapshot = record(history["snapshot"]);
  const snapshotState = record(snapshot["state"]);
  if (
    typeof snapshotState["todoList"] === "object" &&
    snapshotState["todoList"] !== null
  ) {
    options.onTodoSnapshot?.(nativeTodos(record(snapshotState["todoList"])));
  }
  const terminals = new Map<string, TurnOutcome>();
  const items = restoreHistoryItems(
    list(history["items"] ?? snapshotState["items"]),
  );
  const turnDurations = await readTurnDurations(async (cursor) => {
    const page = record(
      await connection.request("view/page", {
        sessionId: chat.museSessionId,
        direction: "forward",
        limit: 1000,
        ...(cursor === "" ? {} : { cursor }),
      }),
    );

    for (const raw of list(page["events"])) {
      const event = record(raw);
      const params = record(event["params"]);

      if (event["method"] === "turn/completed" && text(params["turnId"])) {
        terminals.set(text(params["turnId"]), turnOutcome(params));
      }
    }

    return page;
  });

  const pending = await connection.request("approval/listPending", {
    sessionId: chat.museSessionId,
  });

  const approvals = list(pending["approvals"]).map(toApproval);

  const approvalMode = record(session["approvalMode"]);
  const activeTurn = activeTurns.get(chat.museSessionId);

  const terminal = activeTurn ? terminals.get(activeTurn.turnId) : undefined;

  if (activeTurn && terminal) {
    activeTurn.finish?.(terminal);
    if (activeTurns.get(chat.museSessionId) === activeTurn) {
      activeTurns.delete(chat.museSessionId);
    }
  }

  return {
    activeTurnId: activeTurns.get(chat.museSessionId)?.turnId ?? "",
    activeTurnStartedAt: activeTurns.get(chat.museSessionId)?.startedAt ?? 0,
    running: activeTurns.has(chat.museSessionId),
    items,
    turnDurations,
    pendingApprovals: approvals,
    modelId: text(session["modelId"]),
    providerId: text(session["providerId"]),
    reasoningEffort: effortSettings.get(chat.museSessionId) ?? "",
    permission: approvalModeToPermission(text(approvalMode["mode"])),
  };
}

export async function listMuseModels(
  museSessionId?: string,
): Promise<ChatModelCatalog> {
  const connection = await museHost.connection();

  const params: Record<string, unknown> =
    museSessionId === undefined ? {} : { sessionId: museSessionId };

  const result = await connection.request("model/list", params);

  return {
    providerId: text(result["providerId"]),
    source: text(result["source"]),
    models: list(result["models"]).map(toModelOption),
  };
}

export async function applyChatSettings(input: {
  museSessionId: string;
  modelId?: string;
  providerId?: string;
  reasoningEffort?: string;
  permission?: ChatPermission;
}): Promise<void> {
  const connection = await museHost.connection();

  if (input.modelId !== undefined && input.modelId !== "") {
    const model: Record<string, unknown> = { modelId: input.modelId };

    if (input.providerId !== undefined && input.providerId !== "") {
      model["providerId"] = input.providerId;
    }

    await connection.command("session/setModel", {
      sessionId: input.museSessionId,
      model,
    });
  }

  if (input.reasoningEffort !== undefined && input.reasoningEffort !== "") {
    await connection.command("session/setReasoningEffort", {
      sessionId: input.museSessionId,
      reasoningEffort: input.reasoningEffort,
    });

    effortSettings.set(input.museSessionId, input.reasoningEffort);
  }

  if (input.permission !== undefined) {
    await connection.command("session/setApprovalMode", {
      sessionId: input.museSessionId,
      mode: permissionToApprovalMode(input.permission),
    });
  }
}

export async function listPendingApprovals(
  museSessionId: string,
): Promise<Array<ChatApprovalRequest>> {
  const connection = await museHost.connection();

  const pending = await connection.request("approval/listPending", {
    sessionId: museSessionId,
  });

  return list(pending["approvals"]).map(toApproval);
}

export async function decideMuseApproval(input: {
  museSessionId: string;
  approvalId: string;
  choiceId: string;
  feedback?: string;
}): Promise<void> {
  const connection = await museHost.connection();

  const pending = await connection.request("approval/listPending", {
    sessionId: input.museSessionId,
  });

  const current = list(pending["approvals"])
    .map(record)
    .find((entry) => text(entry["approvalId"]) === input.approvalId);

  if (!current) {
    throw new Error("That approval is no longer pending.");
  }

  const requirement = record(current["currentRequirementId"]);
  const sourceIndex = requirement["sourceIndex"];

  const params: Record<string, unknown> = {
    sessionId: input.museSessionId,
    approvalId: input.approvalId,
    requirementId: {
      approvalId: input.approvalId,
      sourceIndex: typeof sourceIndex === "number" ? sourceIndex : 0,
    },
    choiceId: input.choiceId,
  };

  if (input.feedback !== undefined && input.feedback.trim() !== "") {
    params["feedback"] = input.feedback.trim();
  } else {
    params["feedback"] = null;
  }

  await connection.command("approval/decide", params);
}

export async function leaveMuseSession(museSessionId: string): Promise<void> {
  if (museSessionId === "") {
    return;
  }

  const connection = await museHost.connection();

  try {
    await connection.command("session/leave", {
      sessionId: museSessionId,
      stop: true,
    });
  } catch (cause) {
    const error = record(cause);
    const kind = text(error["kind"]) || text(record(error["data"])["kind"]);

    if (kind !== "sessionNotLoaded" && kind !== "sessionNotFound") {
      throw cause;
    }
  }
}

export async function cancelMuseTurn(
  museSessionId: string,
  turnId: string,
): Promise<void> {
  const connection = await museHost.connection();
  const active = activeTurns.get(museSessionId);
  const currentTurnId =
    active?.previousTurnIds.has(turnId) === true ? active.turnId : turnId;

  await connection.command("turn/cancel", {
    sessionId: museSessionId,
    turnId: currentTurnId,
  });
}

export async function steerMuseTurn(input: {
  museSessionId: string;
  expectedTurnId: string;
  text: string;
  images: Array<{ mediaType: string; base64Data: string }>;
  reasoningEffort?: string;
}): Promise<void> {
  const connection = await museHost.connection();

  const parts: Array<Record<string, unknown>> = [];

  if (input.text.trim() !== "") {
    parts.push({ type: "text", text: input.text });
  }

  for (const image of input.images) {
    parts.push({
      type: "image",
      mediaType: image.mediaType,
      base64Data: image.base64Data,
    });
  }

  if (parts.length === 0) {
    throw new Error("Write a message or attach an image first.");
  }

  const params: Record<string, unknown> = {
    sessionId: input.museSessionId,
    expectedTurnId: input.expectedTurnId,
    input: parts,
  };

  if (input.reasoningEffort !== undefined && input.reasoningEffort !== "") {
    params["reasoningEffort"] = input.reasoningEffort;
  }

  const ack = await connection.command("turn/steer", params);
  const steeredTurnId = text(ack["turnId"]);

  if (steeredTurnId !== "") {
    const current = activeTurns.get(input.museSessionId);

    if (current) {
      if (current.turnId !== steeredTurnId) {
        if (current.retarget) {
          await current.retarget(steeredTurnId);
        } else {
          if (current.turnId !== "") {
            current.previousTurnIds.add(current.turnId);
          }
          current.turnId = steeredTurnId;
          current.startedAt = Date.now();
        }
      }
    } else {
      activeTurns.set(input.museSessionId, {
        turnId: steeredTurnId,
        startedAt: Date.now(),
        previousTurnIds: new Set(),
      });

      const unsubscribe = museHost.subscribe(
        input.museSessionId,
        (notification) => {
          if (
            notification.method === "turn/completed" &&
            text(notification.params["turnId"]) === steeredTurnId &&
            activeTurns.get(input.museSessionId)?.turnId === steeredTurnId
          ) {
            activeTurns.delete(input.museSessionId);
            unsubscribe();
          }
        },
      );
    }
  }
}

export async function runMuseTurn(input: {
  museSessionId: string;
  previewRoot: string;
  text: string;
  images: Array<{ mediaType: string; base64Data: string }>;
  displayText?: string;
  reasoningEffort?: string;
  onEvent: (event: TurnEvent) => void | Promise<void>;
  onTodoSnapshot?: (snapshot: NativeTodoSnapshot) => void;
}): Promise<string> {
  const connection = await museHost.connection();

  const parts: Array<Record<string, unknown>> = [];

  if (input.text.trim() !== "") {
    parts.push({ type: "text", text: input.text });
  }

  for (const image of input.images) {
    parts.push({
      type: "image",
      mediaType: image.mediaType,
      base64Data: image.base64Data,
    });
  }

  if (parts.length === 0) {
    throw new Error("Write a message or attach an image first.");
  }

  const params: Record<string, unknown> = {
    sessionId: input.museSessionId,
    input: parts,
  };

  if (input.displayText !== undefined) {
    params["displayText"] = input.displayText;
  }

  if (input.reasoningEffort !== undefined && input.reasoningEffort !== "") {
    params["reasoningEffort"] = input.reasoningEffort;
  }

  let turnId = "";
  let terminalReceived = false;
  const userItemIds = new Set<string>();
  const turnItemIds = new Set<string>();
  const pendingMedia = new Set<Promise<void>>();

  async function emitPreview(
    ref: { refId: string; mediaType: string } | null,
    direct: { mediaType: string; base64Data: string } | null,
    itemId: string,
    filePaths: string[],
  ): Promise<void> {
    try {
      let mediaType = "";
      let base64Data = "";

      if (direct !== null) {
        mediaType = direct.mediaType;
        base64Data = direct.base64Data;
      } else if (ref !== null) {
        let offset = 0;

        for (;;) {
          const page = record(
            await connection.request("item/readOutput", {
              sessionId: input.museSessionId,
              itemId,
              outputRef: ref.refId,
              offsetBytes: offset,
            }),
          );

          if (page["encoding"] !== "base64") {
            return;
          }

          base64Data += text(page["content"]);

          if (base64Data.length > 8 * 1024 * 1024) {
            return;
          }

          if (page["eof"] === true) {
            break;
          }

          const served = page["byteLen"];

          if (typeof served !== "number" || served <= 0) {
            return;
          }

          offset += served;
        }

        mediaType = ref.mediaType;
      } else {
        let file: { mediaType: string; base64Data: string } | null = null;

        for (const filePath of filePaths) {
          file = await readPreviewFile(filePath, input.previewRoot);

          if (file !== null) {
            break;
          }
        }

        if (file === null) {
          return;
        }

        mediaType = file.mediaType;
        base64Data = file.base64Data;
      }

      await persistPreviewOutput(
        itemId,
        mediaType,
        base64Data,
        input.previewRoot,
      );
      await input.onEvent({
        type: "preview",
        itemId,
        mediaType,
        base64Data,
      });
    } catch {
      return;
    }
  }

  if (activeTurns.has(input.museSessionId)) {
    throw new Error("A turn is already running in this chat.");
  }

  const activeTurn: ActiveTurn = {
    turnId: "",
    startedAt: Date.now(),
    previousTurnIds: new Set(),
  };

  activeTurns.set(input.museSessionId, activeTurn);

  async function announceTurn(id: string) {
    if (terminalReceived || !id || turnId === id) {
      return;
    }

    if (activeTurn.turnId !== "") {
      activeTurn.previousTurnIds.add(activeTurn.turnId);
    }

    turnId = id;
    activeTurn.turnId = id;
    activeTurn.startedAt = Date.now();
    await input.onEvent({
      type: "turn-started",
      turnId: id,
      startedAt: activeTurn.startedAt,
    });
  }

  activeTurn.retarget = announceTurn;

  const completion = new Promise<{
    terminal: string;
    error: string;
    durationMs: number;
  }>((resolve, reject) => {
    const unsubscribe = museHost.subscribe(
      input.museSessionId,
      (notification: MuseNotification) => {
        void (async () => {
          try {
            const itemTurnId = text(
              record(notification.params["item"])["turnId"],
            );
            const eventTurnId =
              text(notification.params["turnId"]) || itemTurnId;

            if (notification.method === "turn/started") {
              await announceTurn(eventTurnId);
              return;
            }

            if (
              turnId !== "" &&
              eventTurnId !== "" &&
              eventTurnId !== activeTurn.turnId &&
              notification.method !== "approval/requested" &&
              notification.method !== "approval/resolved" &&
              notification.method !== "session/todoListChanged"
            ) {
              return;
            }

            if (
              notification.method === "item/started" ||
              notification.method === "item/updated" ||
              notification.method === "item/completed"
            ) {
              const payload =
                notification.method === "item/completed"
                  ? notification.params["item"]
                  : (notification.params["item"] ?? notification.params);

              const item = toHistoryItem(payload);
              turnItemIds.add(item.itemId);

              if (item.kind === "userMessage") {
                userItemIds.add(item.itemId);

                if (
                  input.displayText !== undefined &&
                  text(record(payload)["text"]) === input.text
                ) {
                  item.text = input.displayText;
                }
              }

              if (notification.method === "item/completed") {
                if (
                  item.kind === "toolCall" &&
                  !isGenerateImageTool(item.tool)
                ) {
                  const ref = previewOutputRef(payload, item);
                  const direct = inlinePreview(payload);
                  const filePaths = previewFilePaths(payload, item);

                  if (ref !== null || direct !== null || filePaths.length > 0) {
                    const job = emitPreview(
                      ref,
                      direct,
                      item.itemId,
                      filePaths,
                    ).finally(() => {
                      pendingMedia.delete(job);
                    });
                    pendingMedia.add(job);
                  }
                }
              }

              await input.onEvent({ type: "item", item });
              return;
            }

            if (notification.method === "item/delta") {
              const itemId = text(notification.params["itemId"]);

              if (!turnItemIds.has(itemId) || userItemIds.has(itemId)) {
                return;
              }

              await input.onEvent({
                type: "delta",
                itemId: text(notification.params["itemId"]),
                field: text(notification.params["field"]),
                delta: text(notification.params["delta"]),
              });
              return;
            }

            if (notification.method === "approval/requested") {
              await input.onEvent({
                type: "approval",
                approval: toApproval(notification.params),
              });
              return;
            }

            if (notification.method === "approval/resolved") {
              await input.onEvent({
                type: "approval-resolved",
                approvalId: text(notification.params["approvalId"]),
              });
              return;
            }

            if (notification.method === "session/todoListChanged") {
              const snapshot = nativeTodos(notification.params);
              const todos = snapshot.items.map(record);

              input.onTodoSnapshot?.(snapshot);

              await input.onEvent({ type: "todos", todos });
              return;
            }

            if (notification.method === "turn/completed") {
              const finished = text(notification.params["turnId"]);

              if (activeTurn.turnId === "" && finished !== "") {
                turnId = finished;
                activeTurn.turnId = finished;
              }

              if (finished !== "" && finished === activeTurn.turnId) {
                activeTurn.finish?.(turnOutcome(notification.params));
              }
            }
          } catch (cause) {
            unsubscribe();
            reject(cause);
          }
        })();
      },
    );

    activeTurn.finish = (outcome) => {
      if (terminalReceived) {
        return;
      }

      terminalReceived = true;
      unsubscribe();
      resolve(outcome);
    };

    void connection
      .command("turn/start", params)
      .then(async (ack) => {
        await announceTurn(text(ack["turnId"]));
      })
      .catch((cause: unknown) => {
        unsubscribe();
        reject(cause);
      });
  });

  const outcome = await completion.finally(() => {
    if (activeTurns.get(input.museSessionId) === activeTurn) {
      activeTurns.delete(input.museSessionId);
    }
  });

  while (pendingMedia.size > 0) {
    await Promise.allSettled([...pendingMedia]);
  }

  if (outcome.durationMs <= 0) {
    try {
      const measured = await readTurnDurations(async (cursor) =>
        record(
          await connection.request("view/page", {
            sessionId: input.museSessionId,
            direction: "forward",
            limit: 1000,
            ...(cursor ? { cursor } : {}),
          }),
        ),
      );
      outcome.durationMs = measured[turnId] ?? 0;
    } catch {
      outcome.durationMs = 0;
    }
  }

  if (outcome.error !== "") {
    await input.onEvent({
      type: "turn-completed",
      turnId,
      terminal: outcome.terminal,
      error: outcome.error,
      durationMs: outcome.durationMs,
    });
  } else {
    await input.onEvent({
      type: "turn-completed",
      turnId,
      terminal: outcome.terminal,
      durationMs: outcome.durationMs,
    });
  }

  return turnId;
}

export function museErrorMessage(cause: unknown): string {
  if (typeof cause === "object" && cause !== null) {
    const entry = cause as {
      message?: unknown;
      data?: unknown;
      kind?: unknown;
    };

    const data = record(entry.data);
    const detail = text(data["message"]);

    if (typeof entry.message === "string" && entry.message !== "") {
      if (text(entry.kind) === "authRequired" || detail !== "") {
        return detail !== "" ? detail : entry.message;
      }

      return entry.message;
    }
  }

  if (cause instanceof Error && cause.message !== "") {
    return cause.message;
  }

  return "Muse is unavailable right now.";
}

export function isMuseHostMissing(cause: unknown): boolean {
  if (cause instanceof Error) {
    return (
      cause.message.includes("ENOENT") ||
      cause.message.includes("spawn muse") ||
      cause.message.includes("could not be spawned")
    );
  }

  return false;
}
