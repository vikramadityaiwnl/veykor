import { readFile, stat } from "node:fs/promises";
import type { ChatActivity, ChatThoughtEntry, ChatAttachment, ChatMessage, ChatToolCall, ChatUsage } from "@veykor/shared";
import type { FoldedItem } from "./types.js";
import type { Runtime } from "./provider.js";
import { readConversation, writeConversation, type ConversationMetadata, type StoredAttachment } from "../../chat/conversations.js";
import { attachmentAvailable, stageAttachment } from "../../chat/attachments.js";
import { imageMimeType, isInsideFolder, savedScreenshotPaths, screenshotName } from "../../chat/tool-images.js";
import { responseSeconds } from "../../chat/chat-response-timing.js";
import { museThoughtText } from "./thought-text.js";

export function emptyUsage(): ChatUsage {
  return { inputTokens: 0, outputTokens: 0, cost: 0, costAvailable: false };
}

export function createdAt(item: FoldedItem): number {
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
        ? live.session.items.accumulated(item.itemId) || item.text || ""
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

const maxToolImageBytes = 15_000_000;

async function stageToolImages(
  userId: number,
  live: Runtime,
  metadata: ConversationMetadata,
  turnId: string,
  tools: FoldedItem[],
): Promise<boolean> {
  let changed = false;

  for (const item of tools) {
    if (item.status !== "completed") {
      continue;
    }

    const paths = savedScreenshotPaths(item.visibleOutput || "");

    for (const [index, path] of paths.entries()) {
      const mimeType = imageMimeType(path);

      if (!mimeType || !isInsideFolder(live.folder, path)) {
        continue;
      }

      const attachmentId = `tool-${item.itemId}-${index}`;

      if (live.state.stagedToolImages.has(attachmentId)) {
        continue;
      }

      const existing = metadata.attachments.some(
        (entry) => entry.id === attachmentId,
      );

      if (existing && (await attachmentAvailable(attachmentId))) {
        live.state.stagedToolImages.add(attachmentId);
        continue;
      }

      try {
        const info = await stat(path);

        if (!info.isFile() || info.size > maxToolImageBytes) {
          continue;
        }

        await stageAttachment(attachmentId, await readFile(path));
        live.state.stagedToolImages.add(attachmentId);

        if (!existing) {
          metadata.attachments.push({
            id: attachmentId,
            turnId,
            name: screenshotName(path),
            mimeType,
            size: info.size,
            kind: "image",
            tool: true,
          });
          changed = true;
        }
      } catch {
        continue;
      }
    }
  }

  if (changed) {
    writeConversation(userId, metadata);
  }

  return changed;
}

export async function projectMessages(
  userId: number,
  conversationId: string,
  live: Runtime,
  metadata: ConversationMetadata,
): Promise<{ messages: ChatMessage[]; activities: ChatActivity[] }> {
  const groups = new Map<
    string,
    {
      user: FoldedItem[];
      agent: FoldedItem[];
      tools: FoldedItem[];
      thinking: FoldedItem[];
      entries: ChatThoughtEntry[];
    }
  >();
  const activities: ChatActivity[] = [];
  const items = live.session.items.list();

  for (const item of items) {
    if (item.retracted) {
      continue;
    }

    if (
      item.kind !== "userMessage" &&
      item.kind !== "agentMessage" &&
      item.kind !== "toolCall" &&
      item.kind !== "reasoning"
    ) {
      activities.push(projectActivity(item));
      continue;
    }

    const key = item.turnId || item.itemId;
    let group = groups.get(key);

    if (!group) {
      group = { user: [], agent: [], tools: [], thinking: [], entries: [] };
      groups.set(key, group);
    }

    if (item.kind === "userMessage") {
      group.user.push(item);
    } else if (item.kind === "reasoning") {
      group.thinking.push(item);
      group.entries.push({
        id: item.itemId,
        kind: "reasoning",
        text: museThoughtText(item, live.session.items),
        toolId: "",
      });
    } else if (item.kind === "agentMessage") {
      if (item.status === "inProgress" || item.messagePhase === "commentary") {
        group.thinking.push(item);
        group.entries.push({
          id: item.itemId,
          kind: "commentary",
          text: museThoughtText(item, live.session.items),
          toolId: "",
        });
      } else {
        group.agent.push(item);
      }
    } else {
      group.tools.push(item);
      group.entries.push({
        id: item.itemId,
        kind: "tool",
        text: "",
        toolId: item.itemId,
      });
    }
  }

  for (const [turnId, group] of groups) {
    await stageToolImages(userId, live, metadata, turnId, group.tools);
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
            (entry) => !entry.tool && entry.turnId && entry.turnId === turnId,
          ),
        ),
      });
    }

    if (
      group.agent.length > 0 ||
      group.tools.length > 0 ||
      group.thinking.length > 0
    ) {
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
      const first = group.thinking[0] || group.agent[0] || group.tools[0];
      const timing = metadata.turnTimings?.[turnId];
      if (group.agent.length > 0 && timing) {
        const finalRecordedAt = Math.max(...group.agent.map(createdAt));
        const seconds = responseSeconds(
          timing.startedAt,
          finalRecordedAt,
          timing.seconds,
        );
        if (seconds !== timing.seconds) {
          timing.seconds = seconds;
          const saved = readConversation(userId, conversationId);
          if (saved) {
            saved.turnTimings = {
              ...saved.turnTimings,
              [turnId]: { ...timing },
            };
            writeConversation(userId, saved);
          }
        }
      }

      messages.push({
        id: `assistant-${turnId}`,
        role: "assistant",
        text: agentText(group.agent, live),
        thoughtEntries: group.entries,
        thinkingStartedAt: metadata.turnTimings?.[turnId]?.startedAt || 0,
        thinkingSeconds: metadata.turnTimings?.[turnId]?.seconds || 0,
        thinking: group.thinking
          .map((item) => museThoughtText(item, live.session.items))
          .filter(Boolean)
          .join("\n\n"),
        usage,
        createdAt: createdAt(first),
        tools: group.tools.map(projectTool),
        attachments: await projectAttachments(
          conversationId,
          metadata.attachments.filter(
            (entry) => entry.tool && entry.turnId && entry.turnId === turnId,
          ),
        ),
      });
    }
  }

  return { messages, activities };
}
