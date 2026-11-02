import type { ChatRuntimeProvider } from "../provider.js";
import { listMuseSessions } from "./sessions.js";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ChatApproval, ChatAttachment, ChatPermissionMode, ChatRequest, ChatSession, ChatUsage } from "@veykor/shared";
import type { ApprovalDecisionInput, FoldedItem, Session } from "./types.js";
import { spawnMuse } from "./connection.js";
import { scanDetectedServers } from "../../mcp/detect.js";
import { listMcpServers } from "../../mcp/store.js";
import { mergeSessionMcpSources, toSessionMcpServers } from "../../mcp/session-config.js";
import { metadataSession, projectFolder, readConversation, writeConversation, type StoredAttachment } from "../../chat/conversations.js";
import { attachmentBytes, stageAttachment } from "../../chat/attachments.js";
import { dbPath } from "../../db/client.js";
import { responseSeconds } from "../../chat/chat-response-timing.js";
import { projectMessages, emptyUsage, createdAt } from "./messages.js";
import { openNativeSession } from "./resume.js";
import { nativeInput } from "./input.js";

type Muse = Awaited<ReturnType<typeof spawnMuse>>;

interface RuntimeState {
  approvals: Map<
    string,
    {
      approval: ChatApproval;
      choiceIds: string[];
      resolve: (decision: ApprovalDecisionInput) => void;
    }
  >;
  usage: Map<string, ChatUsage>;
  seenUsage: Set<string>;
  stagedToolImages: Set<string>;
  currentTurn: string;
  lastError: string;
}

export interface Runtime {
  muse: Muse;
  session: Session;
  state: RuntimeState;
  folder: string;
  modelId: string;
  permissionMode: ChatPermissionMode;
}

const runtimes = new Map<string, Runtime>();
const opening = new Map<string, Promise<Runtime>>();
const busy = new Set<string>();
const stopRequested = new Map<string, boolean>();
const pendingErrors = new Map<string, string>();

export async function describeConversation(
  userId: number,
  id: string,
): Promise<ChatSession | undefined> {
  const metadata = readConversation(userId, id);

  if (!metadata) {
    return undefined;
  }

  const live = runtimes.get(`${userId}:${id}`);

  if (!live) {
    const running = busy.has(`${userId}:${id}`);
    const failure = running
      ? ""
      : pendingErrors.get(`${userId}:${id}`) || metadata.recoveryError || "";

    return {
      ...metadataSession(metadata),
      status: running ? "running" : failure ? "error" : "idle",
      error: failure,
      messages: [],
    };
  }

  const { messages, activities } = await projectMessages(
    userId,
    id,
    live,
    metadata,
  );
  const running = busy.has(`${userId}:${id}`);

  return {
    ...metadataSession(metadata),
    nativeSessionId: live.session.sessionId,
    status: running ? "running" : live.state.lastError ? "error" : "idle",
    error: running ? "" : live.state.lastError,
    approvals: [...live.state.approvals.values()].map(
      (entry) => entry.approval,
    ),
    activities,
    messages,
  };
}

export async function openConversation(
  userId: number,
  id: string,
): Promise<ChatSession | undefined> {
  const metadata = readConversation(userId, id);

  if (!metadata) {
    return undefined;
  }

  if (metadata.nativeSessionId) {
    await runtime(userId, id);
  }

  return describeConversation(userId, id);
}

async function runtime(userId: number, id: string): Promise<Runtime> {
  const key = `${userId}:${id}`;
  const existing = runtimes.get(key);
  if (existing) {
    return existing;
  }
  const pending = opening.get(key);
  if (pending) {
    return pending;
  }
  const promise = (async () => {
    const metadata = readConversation(userId, id);
    if (!metadata) {
      throw new Error("Conversation not found");
    }
    const folder = resolve(
      projectFolder(userId, metadata.projectId) ||
        join(dirname(dbPath), "workspaces", String(userId), id),
    );
    await mkdir(folder, { recursive: true });
    const muse = await spawnMuse(folder);
    const state: RuntimeState = {
      approvals: new Map(),
      usage: new Map(),
      seenUsage: new Set(),
      stagedToolImages: new Set(),
      currentTurn: "",
      lastError: "",
    };
    const onApproval: Parameters<Session["onApproval"]>[0] = async (
      request,
    ) => {
      return new Promise<ApprovalDecisionInput>((resolve) => {
        state.approvals.set(request.approvalId, {
          approval: {
            id: request.approvalId,
            toolName: request.toolName,
            arguments: request.rawArgs,
            choices: request.availableChoices.map((choice) => ({
              choiceId: choice.choiceId,
              label: choice.label,
              scope: choice.scope,
              rulePreview: choice.rulePreview || "",
            })),
          },
          choiceIds: request.availableChoices.map((choice) => choice.choiceId),
          resolve,
        });
      });
    };
    const onApprovalError: Parameters<Session["onApprovalError"]>[0] = (
      failure,
    ) => {
      state.lastError = `Permission decision failed: ${failure.kind}`;
    };
    muse.onEvent((notification) => {
      const params = notification.params as Record<string, unknown> | undefined;
      if (notification.method === "session/tokenUsage" && params) {
        const cursor = String(params.viewCursor);
        const turnId = state.currentTurn;
        if (turnId && !state.seenUsage.has(cursor)) {
          state.seenUsage.add(cursor);
          const usage = params.usage as { outputTokens: number } | undefined;
          const entry = state.usage.get(turnId) || emptyUsage();
          entry.inputTokens += Number(params.promptTokens) || 0;
          entry.outputTokens += Number(usage?.outputTokens) || 0;
          state.usage.set(turnId, entry);
        }
      }
      if (notification.method === "item/completed" && params) {
        const item = params.item as FoldedItem | undefined;
        if (
          item?.kind === "agentMessage" &&
          item.messagePhase !== "commentary" &&
          item.turnId
        ) {
          const saved = readConversation(userId, id);
          const timing = saved?.turnTimings?.[item.turnId];
          if (saved && timing) {
            timing.seconds = responseSeconds(
              timing.startedAt,
              createdAt(item),
              timing.seconds,
            );
            writeConversation(userId, saved);
          }
        }
      }
      if (notification.method === "approval/resolved") {
        state.approvals.delete(String(params?.approvalId));
      }
    });
    const mcpServers = muse.mcpGranted
      ? toSessionMcpServers(
          mergeSessionMcpSources(
            listMcpServers(userId),
            scanDetectedServers().flatMap((source) =>
              source.entries.map((entry) => entry.input),
            ),
          ),
          folder,
        )
      : undefined;

    let session: Session;
    try {
      session = await openNativeSession(muse, folder, metadata, {
        onApproval,
        onApprovalError,
        mcpServers,
      });
      session.onApproval(onApproval);
      session.onApprovalError(onApprovalError);
      metadata.nativeSessionId = session.sessionId;
      writeConversation(userId, metadata);
    } catch (error) {
      await muse.close();
      throw error;
    }
    if (session.activeTurnId) {
      state.lastError =
        "Execution was interrupted by a backend restart and its outcome is uncertain. Review the conversation before sending again; nothing was resent automatically.";
      const saved = readConversation(userId, id);
      if (saved) {
        saved.recoveryError = state.lastError;
        writeConversation(userId, saved);
      }
    }

    const result: Runtime = {
      muse,
      session,
      state,
      folder,
      modelId: metadata.modelId,
      permissionMode: metadata.permissionMode,
    };
    runtimes.set(key, result);
    void muse.connection.closed.then(() => {
      runtimes.delete(key);
      if (busy.has(key)) {
        state.lastError =
          "Muse disconnected. Send another message to resume its durable session.";
      }
      state.approvals.clear();
    });
    return result;
  })().finally(() => {
    opening.delete(key);
  });
  opening.set(key, promise);
  return promise;
}

export async function setPermissionMode(
  userId: number,
  id: string,
  mode: ChatPermissionMode,
) {
  const live = await runtime(userId, id);
  if (live.permissionMode === mode) {
    return;
  }

  await live.muse.connection.command("session/setApprovalMode", {
    sessionId: live.session.sessionId,
    mode,
  });
  live.permissionMode = mode;
  const metadata = readConversation(userId, id);
  if (metadata) {
    metadata.permissionMode = mode;
    writeConversation(userId, metadata);
  }
}

export async function decideApproval(
  userId: number,
  id: string,
  approvalId: string,
  choiceId: string,
) {
  const live = await runtime(userId, id);
  const request = live.state.approvals.get(approvalId);
  if (!request || !request.choiceIds.includes(choiceId)) {
    throw new Error("This permission choice is no longer available");
  }
  live.state.approvals.delete(approvalId);
  request.resolve({ choiceId });
}

export async function stopConversation(
  userId: number,
  id: string,
  cancel = false,
) {
  if (!isBusy(userId, id)) {
    return;
  }
  stopRequested.set(`${userId}:${id}`, cancel);
  const live = await runtime(userId, id);
  const turnId = live.session.activeTurnId;
  if (turnId) {
    await live.muse.connection.command(
      cancel ? "turn/cancel" : "turn/interrupt",
      { sessionId: live.session.sessionId, turnId },
    );
  }
}

export function isBusy(userId: number, id: string) {
  return busy.has(`${userId}:${id}`);
}

function decodeDataUrl(dataUrl: string): Buffer | undefined {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");

  if (!match) {
    return undefined;
  }

  try {
    return Buffer.from(match[2], "base64");
  } catch {
    return undefined;
  }
}

async function stagedInputs(
  attachments: StoredAttachment[],
): Promise<ChatAttachment[]> {
  const inputs: ChatAttachment[] = [];

  for (const attachment of attachments) {
    const bytes = await attachmentBytes(attachment.id);

    if (!bytes) {
      continue;
    }

    inputs.push({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      dataUrl: `data:${attachment.mimeType};base64,${bytes.toString("base64")}`,
      text: "",
    });
  }

  return inputs;
}

export async function runChat(userId: number, input: ChatRequest) {
  const id = input.conversationId;
  const key = `${userId}:${id}`;
  if (busy.has(key)) {
    throw new Error("A reply is already running");
  }
  const metadata = readConversation(userId, id);
  if (!metadata) {
    throw new Error("Conversation not found");
  }
  busy.add(key);
  const startedAt = Date.now();
  let submittedTurnId = "";
  pendingErrors.delete(key);
  try {
    const message = input.messages.at(-1)!;
    const pendingAttachments = metadata.attachments.filter(
      (entry) => !entry.turnId,
    );
    for (const attachment of message.attachments || []) {
      const bytes = decodeDataUrl(attachment.dataUrl);

      if (bytes) {
        await stageAttachment(attachment.id, bytes);
        if (!metadata.attachments.some((entry) => entry.id === attachment.id)) {
          metadata.attachments.push({
            id: attachment.id,
            turnId: "",
            submissionId: input.messageId,
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
            kind: attachment.kind,
          });
        }
      }
    }
    metadata.modelId = input.modelId;
    metadata.recoveryError = "";
    writeConversation(userId, metadata);
    const live = await runtime(userId, id);
    const parts = await nativeInput(
      [
        ...(message.attachments || []),
        ...(await stagedInputs(pendingAttachments)),
      ],
      message.text,
      input.modelId,
    );
    if (Buffer.byteLength(JSON.stringify(parts)) > 10_000_000) {
      throw new Error(
        "Native Muse input must fit within its 10 MiB protocol frame. Use fewer or smaller images.",
      );
    }
    await setPermissionMode(userId, id, input.permissionMode);
    if (live.modelId !== input.modelId) {
      await live.muse.connection.command("session/setModel", {
        sessionId: live.session.sessionId,
        model: { modelId: input.modelId },
      });
      live.modelId = input.modelId;
    }
    if (stopRequested.has(key)) {
      return;
    }
    const turn = await live.session.sendUserTurn({
      input: parts,
      reasoningEffort: input.reasoningEffort,
      composerInput: message.text,
      submissionId: input.messageId,
    });
    submittedTurnId = turn.turnId;
    live.state.currentTurn = turn.turnId;
    live.state.lastError = "";
    if (stopRequested.has(key)) {
      await live.muse.connection.command(
        stopRequested.get(key) ? "turn/cancel" : "turn/interrupt",
        { sessionId: live.session.sessionId, turnId: turn.turnId },
      );
    }
    const settled = readConversation(userId, id);
    if (settled) {
      settled.turnTimings = {
        ...settled.turnTimings,
        [turn.turnId]: { startedAt, seconds: 0 },
      };
      for (const attachment of settled.attachments) {
        if (!attachment.turnId) {
          attachment.turnId = turn.turnId;
          attachment.submissionId = input.messageId;
        }
      }
      writeConversation(userId, settled);
    }
    const outcome = await turn.completed;
    if (outcome.kind === "completed") {
      const usage = outcome.params.usage;
      if (usage && !live.state.usage.has(turn.turnId)) {
        live.state.usage.set(turn.turnId, {
          ...emptyUsage(),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
      }
      if (outcome.params.terminal === "failed") {
        live.state.lastError =
          outcome.params.error?.message || "Muse turn failed";
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Muse request failed";
    const live = runtimes.get(key);
    if (live) {
      live.state.lastError = message;
    } else {
      pendingErrors.set(key, message);
    }
  } finally {
    if (submittedTurnId) {
      const settled = readConversation(userId, id);
      if (settled) {
        settled.turnTimings = {
          ...settled.turnTimings,
          [submittedTurnId]: {
            startedAt,
            seconds:
              settled.turnTimings?.[submittedTurnId]?.seconds ||
              Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          },
        };
        writeConversation(userId, settled);
      }
    }
    busy.delete(key);
    stopRequested.delete(key);
  }
}

export async function closeMuseSessions() {
  await Promise.all([...runtimes.values()].map((entry) => entry.muse.close()));
  runtimes.clear();
}

export async function releaseConversation(userId: number, id: string) {
  const key = `${userId}:${id}`;
  const live = runtimes.get(key);
  if (live) {
    await live.muse.close();
    runtimes.delete(key);
  }
  pendingErrors.delete(key);
}

async function steer(userId: number, input: ChatRequest) {
  const live = await runtime(userId, input.conversationId);
  const turnId = live.session.activeTurnId;

  if (!turnId) {
    throw new Error("There is no active turn to steer");
  }

  const message = input.messages.at(-1)!;
  const parts = await nativeInput(
    message.attachments || [],
    message.text,
    live.modelId,
  );
  await live.muse.connection.command("turn/steer", {
    commandId: input.messageId,
    sessionId: live.session.sessionId,
    expectedTurnId: turnId,
    input: parts,
    reasoningEffort: input.reasoningEffort,
  });
  const metadata = readConversation(userId, input.conversationId)!;

  for (const attachment of message.attachments || []) {
    const bytes = decodeDataUrl(attachment.dataUrl);

    if (bytes) {
      await stageAttachment(attachment.id, bytes);
      metadata.attachments.push({
        id: attachment.id,
        turnId,
        submissionId: input.messageId,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        kind: attachment.kind,
      });
    }
  }

  writeConversation(userId, metadata);
}

export const museProvider: ChatRuntimeProvider = {
  id: "muse",
  listSessions: listMuseSessions,
  describe: describeConversation,
  open: openConversation,
  runTurn: runChat,
  steer,
  setPermissionMode,
  decideApproval,
  stop: stopConversation,
  isBusy,
  release: releaseConversation,
  close: closeMuseSessions,
};
