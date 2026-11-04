import { userMessageText } from "./user-message-text.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
import { databasePath } from "../db/client.js";
import { readTurnDurations } from "./turn-durations.js";
import { museHost } from "./muse-host.js";
import type { MuseNotification } from "./muse-host.js";

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

export function workspaceFor(userId: number): string {
  const root = resolve(dirname(databasePath), "workspaces", String(userId));

  mkdirSync(root, { recursive: true });

  return root;
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

const activeTurns = new Map<string, ActiveTurn>();

export function activeMuseTurn(museSessionId: string): string {
  return activeTurns.get(museSessionId)?.turnId ?? "";
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
): Promise<Omit<ChatDetail, "chat" | "pendingQuestions" | "recentQuestions">> {
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
  const items = list(history["items"] ?? snapshotState["items"])
    .map(toHistoryItem)
    .filter(
      (item) =>
        item.kind !== "userMessage" ||
        item.text !== "" ||
        item.attachments.length > 0,
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

  await connection.command("turn/cancel", {
    sessionId: museSessionId,
    turnId,
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

  await connection.command("turn/steer", params);
}

export async function runMuseTurn(input: {
  museSessionId: string;
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

  if (activeTurns.has(input.museSessionId)) {
    throw new Error("A turn is already running in this chat.");
  }

  const activeTurn: ActiveTurn = { turnId: "", startedAt: Date.now() };

  activeTurns.set(input.museSessionId, activeTurn);

  async function announceTurn(id: string) {
    if (terminalReceived || !id || turnId === id) {
      return;
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

            if (
              turnId !== "" &&
              eventTurnId !== "" &&
              eventTurnId !== turnId &&
              notification.method !== "approval/requested" &&
              notification.method !== "approval/resolved" &&
              notification.method !== "session/todoListChanged"
            ) {
              return;
            }

            if (notification.method === "turn/started") {
              await announceTurn(eventTurnId);
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

              if (turnId === "" && finished !== "") {
                turnId = finished;
              }

              if (finished !== "" && finished === turnId) {
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
