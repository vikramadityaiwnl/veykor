import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ChatApproval, ChatPermissionMode, ChatRequest, ChatSession } from "@veykor/shared";
import type { ChatRuntimeProvider } from "../provider.js";
import { dbPath } from "../../db/client.js";
import { metadataSession, projectFolder, readConversation, writeConversation } from "../../chat/conversations.js";
import { stageAttachment } from "../../chat/attachments.js";
import { openCodeConnection, closeOpenCodeConnection } from "./connection.js";
import { listOpenCodeSessions } from "./sessions.js";
import { newChat } from "./new-chat.js";
import { resumeChat } from "./resume.js";
import { modelReference } from "./models.js";
import { permissionRules } from "./permissions.js";
import { projectMessages, type OpenCodeMessage } from "./messages.js";

interface Runtime {
  session: ChatSession;
  busy: boolean;
  stopRequested: boolean;
  syncedAt: number;
  nativeBusy: boolean;
  idleAt: number;
  submittedId: string;
  syncing?: Promise<void>;
}

const runtimes = new Map<string, Runtime>();
const opening = new Map<string, Promise<Runtime>>();
const errors = new Map<string, string>();
const keyFor = (userId: number, id: string) => `${userId}:${id}`;
const sessionPath = (sessionId: string) =>
  `/api/session/${encodeURIComponent(sessionId)}`;

async function runtime(userId: number, id: string): Promise<Runtime> {
  const key = keyFor(userId, id);
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

    if (!metadata || metadata.providerId !== "opencode") {
      throw new Error("OpenCode conversation not found");
    }

    const folder = resolve(
      projectFolder(userId, metadata.projectId) ||
        join(dirname(dbPath), "workspaces", String(userId), id),
    );
    await mkdir(folder, { recursive: true });
    const connection = await openCodeConnection();

    if (metadata.nativeSessionId) {
      await resumeChat(connection, metadata.nativeSessionId, folder);
    } else {
      metadata.nativeSessionId = await newChat(connection, metadata, folder);
      writeConversation(userId, metadata);
    }

    const live: Runtime = {
      session: metadataSession(metadata),
      busy: false,
      stopRequested: false,
      syncedAt: 0,
      nativeBusy: false,
      idleAt: 0,
      submittedId: "",
    };
    runtimes.set(key, live);
    await sync(userId, id, live);

    return live;
  })().finally(() => {
    opening.delete(key);
  });
  opening.set(key, promise);

  return promise;
}

async function sync(
  userId: number,
  id: string,
  live: Runtime,
  force = false,
): Promise<void> {
  if (live.syncing) {
    return live.syncing;
  }

  if (!force && Date.now() - live.syncedAt < 500) {
    return;
  }

  live.syncing = (async () => {
    const metadata = readConversation(userId, id);

    if (!metadata) {
      return;
    }

    const connection = await openCodeConnection();
    const path = sessionPath(metadata.nativeSessionId);
    const rows: OpenCodeMessage[] = [];
    let cursor = "";

    do {
      const query = new URLSearchParams(
        cursor ? { cursor, limit: "100" } : { order: "asc", limit: "100" },
      );
      const page = await connection.request("GET", `${path}/message?${query}`);
      rows.push(...page.data);
      cursor = page.cursor?.next || "";
    } while (cursor);

    const [permissions, info, active] = await Promise.all([
      connection.request("GET", `${path}/permission`),
      connection.request("GET", path),
      connection.request("GET", "/api/session/active"),
    ]);
    const approvals: ChatApproval[] = permissions.data.map(
      (request: { id: string; action: string; resources: string[] }) => ({
        id: request.id,
        toolName: request.action,
        arguments: request.resources.join("\n"),
        choices: [
          {
            choiceId: "once",
            label: "Allow once",
            scope: "once",
            rulePreview: "",
          },
          {
            choiceId: "always",
            label: "Always allow",
            scope: "persistent",
            rulePreview: "",
          },
          { choiceId: "reject", label: "Deny", scope: "once", rulePreview: "" },
        ],
      }),
    );
    live.nativeBusy = !!active.data[metadata.nativeSessionId];
    live.idleAt = info.data.time.idle || 0;
    const running = live.busy || live.nativeBusy;
    const failedExecution = info.data.outcome === "failed";
    const interruptedHost =
      !live.nativeBusy && (info.data.time.busy || 0) > live.idleAt;
    const failure =
      [...rows].reverse().find((row) => row.type === "assistant")?.error
        ?.message ||
      (failedExecution
        ? "OpenCode execution failed. Check the session in OpenCode for details."
        : "") ||
      (interruptedHost
        ? "The previous execution is not active in this backend. Send a message to continue the OpenCode session."
        : "");
    live.session = {
      ...metadataSession(metadata),
      status: running
        ? "running"
        : failure || live.session.error
          ? "error"
          : "idle",
      error: running ? "" : failure || live.session.error || "",
      approvals,
      messages: await projectMessages(rows, id, metadata.attachments),
      activities:
        info.data.outcome === "interrupted"
          ? [
              {
                id: "interrupted",
                kind: "interrupted",
                status: "complete",
                text: "Execution was interrupted.",
              },
            ]
          : [],
    };
    live.syncedAt = Date.now();
  })().finally(() => {
    live.syncing = undefined;
  });

  return live.syncing;
}

async function describe(
  userId: number,
  id: string,
): Promise<ChatSession | undefined> {
  const metadata = readConversation(userId, id);

  if (!metadata) {
    return undefined;
  }

  const live = runtimes.get(keyFor(userId, id));

  if (!live) {
    const error = errors.get(keyFor(userId, id)) || "";
    return {
      ...metadataSession(metadata),
      status: opening.has(keyFor(userId, id))
        ? "running"
        : error
          ? "error"
          : "idle",
      error,
    };
  }

  try {
    await sync(userId, id, live);
  } catch (error) {
    live.session.error =
      error instanceof Error ? error.message : "OpenCode history unavailable";
    live.session.status = "error";
  }

  return live.session;
}

async function setPermissionMode(
  userId: number,
  id: string,
  mode: ChatPermissionMode,
) {
  const live = await runtime(userId, id);
  const connection = await openCodeConnection();
  await connection.request(
    "PATCH",
    sessionPath(live.session.nativeSessionId!),
    { permissions: permissionRules(mode) },
  );
  const metadata = readConversation(userId, id)!;
  metadata.permissionMode = mode;
  writeConversation(userId, metadata);
  live.syncedAt = 0;
}

async function runTurn(userId: number, input: ChatRequest) {
  const id = input.conversationId;
  const key = keyFor(userId, id);
  errors.delete(key);
  let live: Runtime;

  try {
    live = await runtime(userId, id);
  } catch (error) {
    errors.set(
      key,
      error instanceof Error
        ? error.message
        : "Unable to open OpenCode session",
    );
    return;
  }

  if (live.busy) {
    return;
  }

  live.busy = true;
  live.stopRequested = false;
  live.session.error = "";
  live.session.status = "running";

  try {
    const connection = await openCodeConnection();
    const path = sessionPath(live.session.nativeSessionId!);
    await setPermissionMode(userId, id, input.permissionMode);
    await connection.request("POST", `${path}/model`, {
      model: modelReference(input.modelId, input.reasoningEffort),
    });
    const message = input.messages.at(-1)!;
    const files = (message.attachments || []).map((attachment) => ({
      uri: attachment.dataUrl,
      name: attachment.name,
    }));
    const metadata = readConversation(userId, id)!;
    metadata.modelId = input.modelId;

    for (const attachment of message.attachments || []) {
      const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(
        attachment.dataUrl,
      );

      if (!match) {
        throw new Error("Invalid image data");
      }

      await stageAttachment(attachment.id, Buffer.from(match[2], "base64"));
    }

    if (live.stopRequested) {
      return;
    }

    const accepted = await connection.request("POST", `${path}/prompt`, {
      id: `msg_${input.messageId.replaceAll("-", "")}`,
      text: message.text,
      files,
      metadata: { veykorSubmissionId: input.messageId },
      delivery: "queue",
    });
    live.submittedId = accepted.data.id;
    const admittedAt = accepted.data.time.created as number;

    for (const attachment of message.attachments || []) {
      metadata.attachments.push({
        id: attachment.id,
        turnId: accepted.data.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        kind: attachment.kind,
      });
    }

    writeConversation(userId, metadata);

    if (live.stopRequested) {
      await interrupt(live);
    }

    while (true) {
      await sync(userId, id, live, true);
      const submitted = live.session.messages.some(
        (entry) => entry.id === live.submittedId,
      );

      if (
        !live.nativeBusy &&
        (live.stopRequested || (submitted && live.idleAt >= admittedAt))
      ) {
        break;
      }

      await delay(500);
    }
  } catch (error) {
    live.session.error =
      error instanceof Error ? error.message : "OpenCode request failed";
  } finally {
    live.busy = false;
    live.submittedId = "";
    live.syncedAt = 0;

    try {
      await sync(userId, id, live, true);
    } catch (error) {
      live.session.error =
        error instanceof Error ? error.message : "OpenCode disconnected";
      live.session.status = "error";
    }
  }
}

async function interrupt(live: Runtime) {
  const connection = await openCodeConnection();
  const path = sessionPath(live.session.nativeSessionId!);
  await connection.request("POST", `${path}/interrupt?resume=false`);

  if (live.submittedId) {
    try {
      await connection.request(
        "DELETE",
        `${path}/inbox/${encodeURIComponent(live.submittedId)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (!message.includes(": 404 ") && !message.includes(": 409 ")) {
        throw error;
      }
    }
  }
}

async function steer(userId: number, input: ChatRequest) {
  const live = await runtime(userId, input.conversationId);
  const connection = await openCodeConnection();
  const message = input.messages.at(-1)!;
  const accepted = await connection.request(
    "POST",
    `${sessionPath(live.session.nativeSessionId!)}/prompt`,
    {
      id: `msg_${input.messageId.replaceAll("-", "")}`,
      text: message.text,
      files: (message.attachments || []).map((attachment) => ({
        uri: attachment.dataUrl,
        name: attachment.name,
      })),
      metadata: { veykorSubmissionId: input.messageId },
      delivery: "steer",
    },
  );
  const metadata = readConversation(userId, input.conversationId)!;

  for (const attachment of message.attachments || []) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(
      attachment.dataUrl,
    );

    if (match) {
      await stageAttachment(attachment.id, Buffer.from(match[2], "base64"));
      metadata.attachments.push({
        id: attachment.id,
        turnId: accepted.data.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        kind: attachment.kind,
      });
    }
  }

  writeConversation(userId, metadata);
  live.syncedAt = 0;
}

export const opencodeProvider: ChatRuntimeProvider = {
  id: "opencode",
  listSessions: listOpenCodeSessions,
  describe,
  open: async (userId, id) => {
    const metadata = readConversation(userId, id);

    if (!metadata) {
      return undefined;
    }

    if (!metadata.nativeSessionId) {
      return describe(userId, id);
    }

    const live = await runtime(userId, id);
    await sync(userId, id, live, true);

    return live.session;
  },
  runTurn,
  steer,
  setPermissionMode,
  decideApproval: async (userId, id, approvalId, choiceId) => {
    const live = await runtime(userId, id);
    await sync(userId, id, live, true);
    const approval = live.session.approvals?.find(
      (entry) => entry.id === approvalId,
    );

    if (!approval?.choices.some((choice) => choice.choiceId === choiceId)) {
      throw new Error("This permission choice is no longer available");
    }

    const connection = await openCodeConnection();
    await connection.request(
      "POST",
      `${sessionPath(live.session.nativeSessionId!)}/permission/${encodeURIComponent(approvalId)}/reply`,
      { decision: choiceId },
    );
    live.syncedAt = 0;
  },
  stop: async (userId, id) => {
    const live = await runtime(userId, id);
    live.stopRequested = true;
    await interrupt(live);
  },
  isBusy: (userId, id) =>
    runtimes.get(keyFor(userId, id))?.busy === true ||
    opening.has(keyFor(userId, id)),
  release: async (userId, id) => {
    runtimes.delete(keyFor(userId, id));
    errors.delete(keyFor(userId, id));
  },
  close: async () => {
    await closeOpenCodeConnection();
    runtimes.clear();
  },
};
