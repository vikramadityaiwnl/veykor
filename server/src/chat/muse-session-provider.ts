import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ChatActivity, ChatApproval, ChatAttachment, ChatMessage, ChatPermissionMode, ChatRequest, ChatSession, ChatToolCall, ChatUsage } from "@veykor/shared";
import type { ApprovalDecisionInput, FoldedItem, Session } from "@muse-code/sdk";
import { spawnMuse } from "./muse-host.js";
import { scanDetectedServers } from "../mcp/detect.js";
import { listMcpServers } from "../mcp/store.js";
import { mergeSessionMcpSources, toSessionMcpServers, type SessionMcpServerConfig } from "../mcp/session-config.js";
import { metadataSession, projectFolder, readConversation, writeConversation, type ConversationMetadata, type StoredAttachment } from "./conversations.js";
import { attachmentAvailable, attachmentBytes, stageAttachment } from "./attachments.js";
import { dbPath } from "../db/client.js";
import { nativeInput } from "./muse-input.js";

export const permissionModes: ChatPermissionMode[] = [
  "promptUnmatched",
  "onRequest",
  "denyUnmatched",
  "allowAll",
];

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
  currentTurn: string;
  lastError: string;
  history: FoldedItem[];
}

interface SessionRead {
  history: { items: FoldedItem[] | null };
  session: { turnId: string | null };
}

interface Runtime {
  muse: Muse;
  session: Session;
  state: RuntimeState;
}

const runtimes = new Map<string, Runtime>();
const opening = new Map<string, Promise<Runtime>>();
const busy = new Set<string>();
const stopRequested = new Map<string, boolean>();
const pendingErrors = new Map<string, string>();

function emptyUsage(): ChatUsage {
  return { inputTokens: 0, outputTokens: 0, cost: 0, costAvailable: false };
}

function createdAt(item: FoldedItem): number {
  const time = item.recordedAt ? Date.parse(item.recordedAt) : NaN;

  return Number.isSafeInteger(time) ? time : 0;
}

function toolStatus(item: FoldedItem): ChatToolCall["status"] {
  return item.status === "inProgress"
    ? "running"
    : item.status === "completed"
      ? "complete"
      : "error";
}

function projectTool(item: FoldedItem): ChatToolCall {
  return {
    id: item.itemId,
    name: item.tool || "Tool",
    target: item.args || "",
    status: toolStatus(item),
    result: item.visibleOutput || "",
    errorMessage: item.failureReason || "",
  };
}

function projectActivity(item: FoldedItem): ChatActivity {
  return {
    id: item.itemId,
    kind: String(item.kind),
    status: String(item.status),
    text: String(
      item.text ||
        item.summary?.join("\n") ||
        item.statusLine ||
        item.fallbackText ||
        item.kind,
    ),
  };
}

function agentText(items: readonly FoldedItem[], live: Runtime): string {
  return items
    .map((item) =>
      item.status === "inProgress"
        ? live.session.fold.items.accumulated(item.itemId) || item.text || ""
        : item.text || "",
    )
    .filter((text) => text)
    .join("\n\n");
}

async function projectAttachments(
  conversationId: string,
  attachments: StoredAttachment[],
): Promise<ChatAttachment[]> {
  return Promise.all(
    attachments.map(async (attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      dataUrl: (await attachmentAvailable(attachment.id))
        ? `/api/chat/sessions/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachment.id)}`
        : "",
      text: "",
    })),
  );
}

async function projectMessages(
  conversationId: string,
  live: Runtime,
  metadata: ConversationMetadata,
): Promise<{ messages: ChatMessage[]; activities: ChatActivity[] }> {
  const groups = new Map<
    string,
    { user: FoldedItem[]; agent: FoldedItem[]; tools: FoldedItem[] }
  >();
  const activities: ChatActivity[] = [];
  const liveItems = live.session.fold.items.list();
  const liveIds = new Set(liveItems.map((item) => item.itemId));
  const items = [
    ...live.state.history.filter((item) => !liveIds.has(item.itemId)),
    ...liveItems,
  ];

  for (const item of items) {
    if (item.retracted) {
      continue;
    }

    if (
      item.kind !== "userMessage" &&
      item.kind !== "agentMessage" &&
      item.kind !== "toolCall"
    ) {
      activities.push(projectActivity(item));
      continue;
    }

    const key = item.turnId || item.itemId;
    let group = groups.get(key);

    if (!group) {
      group = { user: [], agent: [], tools: [] };
      groups.set(key, group);
    }

    if (item.kind === "userMessage") {
      group.user.push(item);
    } else if (item.kind === "agentMessage") {
      group.agent.push(item);
    } else {
      group.tools.push(item);
    }
  }

  const messages: ChatMessage[] = [];

  for (const [turnId, group] of groups) {
    if (group.user.length > 0) {
      messages.push({
        id: group.user[0].itemId,
        role: "user",
        text: group.user.map((item) => item.text || "").join("\n\n"),
        usage: emptyUsage(),
        createdAt: createdAt(group.user[0]),
        tools: [],
        attachments: await projectAttachments(
          conversationId,
          metadata.attachments.filter(
            (entry) => entry.turnId && entry.turnId === turnId,
          ),
        ),
      });
    }

    if (group.agent.length > 0 || group.tools.length > 0) {
      const liveUsage = live.state.usage.get(turnId);
      const usage = liveUsage || {
        ...emptyUsage(),
        inputTokens: group.agent.reduce(
          (total, item) => total + (item.usage?.inputTokens || 0),
          0,
        ),
        outputTokens: group.agent.reduce(
          (total, item) => total + (item.usage?.outputTokens || 0),
          0,
        ),
      };
      const first = group.agent[0] || group.tools[0];

      messages.push({
        id: first.itemId,
        role: "assistant",
        text: agentText(group.agent, live),
        usage,
        createdAt: createdAt(first),
        tools: group.tools.map(projectTool),
        attachments: [],
      });
    }
  }

  return { messages, activities };
}

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
    const failure = running ? "" : pendingErrors.get(`${userId}:${id}`) || "";

    return {
      ...metadataSession(metadata),
      status: running ? "running" : failure ? "error" : "idle",
      error: failure,
      messages: [],
    };
  }

  const { messages, activities } = await projectMessages(id, live, metadata);
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

function startedSessionId(result: Record<string, unknown>): string {
  const session =
    result.session && typeof result.session === "object"
      ? (result.session as Record<string, unknown>)
      : null;

  const id = session?.sessionId;

  if (typeof id !== "string" || !id) {
    throw new Error("Muse did not return a session id");
  }

  return id;
}

function mcpWarning(action: string, error: unknown): void {
  console.warn(
    `${action}: ${error instanceof Error ? error.message : "unknown error"}`,
  );
}

async function openNativeSession(
  muse: Muse,
  folder: string,
  metadata: ConversationMetadata,
  options: {
    onApproval: Parameters<Session["onApproval"]>[0];
    onApprovalError: Parameters<Session["onApprovalError"]>[0];
    mcpServers: Record<string, SessionMcpServerConfig> | undefined;
  },
): Promise<Session> {
  const approvalMode = metadata.permissionMode || "promptUnmatched";

  if (metadata.nativeSessionId) {
    if (options.mcpServers) {
      try {
        await muse.connection.command("session/resume", {
          sessionId: metadata.nativeSessionId,
          config: { mcpServers: options.mcpServers },
        });
      } catch (error) {
        mcpWarning("Continuing without updating chat MCP servers", error);
      }
    }

    return muse.client.resumeSession({
      sessionId: metadata.nativeSessionId,
      onApproval: options.onApproval,
      onApprovalError: options.onApprovalError,
    });
  }

  if (options.mcpServers) {
    let nativeSessionId: string | undefined;

    try {
      nativeSessionId = startedSessionId(
        await muse.connection.command("session/start", {
          workspaceRoot: folder,
          modelId: metadata.modelId,
          approvalMode,
          config: { mcpServers: options.mcpServers },
        }),
      );
    } catch (error) {
      mcpWarning("Continuing without chat MCP servers", error);
    }

    if (nativeSessionId !== undefined) {
      return muse.client.resumeSession({
        sessionId: nativeSessionId,
        onApproval: options.onApproval,
        onApprovalError: options.onApprovalError,
      });
    }
  }

  return muse.client.startSession({
    workspaceRoot: folder,
    modelId: metadata.modelId,
    approvalMode,
  });
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
      currentTurn: "",
      lastError: "",
      history: [],
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
    try {
      const read = (await muse.connection.command("session/read", {
        sessionId: session.sessionId,
        excludeItems: false,
      })) as unknown as SessionRead;
      state.history = read.history.items || [];
      if (read.session.turnId) {
        state.lastError =
          "The backend restarted during execution. Send a message to resume this Muse session.";
      }
    } catch {
      state.history = [];
    }
    const result: Runtime = { muse, session, state };
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
  await live.muse.connection.command("session/setApprovalMode", {
    sessionId: live.session.sessionId,
    mode,
  });
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
  const turnId = live.session.fold.activeTurnId;
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
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
            kind: attachment.kind,
          });
        }
      }
    }
    metadata.modelId = input.modelId;
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
    await live.muse.connection.command("session/setModel", {
      sessionId: live.session.sessionId,
      model: { modelId: input.modelId },
    });
    if (stopRequested.has(key)) {
      return;
    }
    const turn = await live.session.sendUserTurn({
      input: parts,
      reasoningEffort: input.reasoningEffort,
      composerInput: message.text,
    });
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
      for (const attachment of settled.attachments) {
        if (!attachment.turnId) {
          attachment.turnId = turn.turnId;
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
