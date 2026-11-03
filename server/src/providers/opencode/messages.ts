import type { ChatMessage, ChatToolCall, ChatAttachment, ChatThoughtEntry } from "@veykor/shared";
import type { StoredAttachment } from "../../chat/conversations.js";
import { attachmentAvailable } from "../../chat/attachments.js";

export interface OpenCodeMessage {
  id: string;
  type: string;
  metadata?: { veykorSubmissionId?: string };
  text?: string;
  time: { created: number; completed?: number };
  error?: { message: string };
  cost?: number;
  tokens?: { input: number; output: number };
  content?: {
    id?: string;
    type: string;
    name?: string;
    text?: string;
    state?: {
      status: string;
      input: object | string;
      content?: { type: string; text?: string }[];
      error?: { message: string };
    };
  }[];
}

export async function projectMessages(
  rows: OpenCodeMessage[],
  conversationId: string,
  attachments: StoredAttachment[],
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];

  for (const row of rows) {
    if (row.type !== "user" && row.type !== "assistant") {
      continue;
    }

    const tools: ChatToolCall[] = [];
    const thoughtEntries: ChatThoughtEntry[] = [];
    const text: string[] = [];
    const thinking: string[] = [];

    for (const [index, part] of (row.content || []).entries()) {
      const id = part.id || `${row.id}-${index}`;

      if (part.type === "text") {
        if (!/^step interrupted[.!]?$/i.test((part.text || "").trim())) {
          text.push(part.text || "");
        }
      } else if (part.type === "reasoning") {
        thinking.push(part.text || "");
        thoughtEntries.push({
          id,
          kind: "reasoning",
          text: part.text || "",
          toolId: "",
        });
      } else if (part.type === "tool" && part.state) {
        const state = part.state;
        tools.push({
          id,
          name: part.name || "Tool",
          target:
            typeof state.input === "string"
              ? state.input
              : JSON.stringify(state.input),
          status:
            state.status === "completed"
              ? "complete"
              : state.status === "error"
                ? "error"
                : "running",
          result: (state.content || [])
            .map((content) => content.text || "")
            .filter(Boolean)
            .join("\n"),
          errorMessage: state.error?.message || "",
        });
        thoughtEntries.push({ id, kind: "tool", text: "", toolId: id });
      }
    }

    const files: ChatAttachment[] = await Promise.all(
      attachments
        .filter((entry) => entry.turnId === row.id)
        .map(async (entry) => ({
          id: entry.id,
          name: entry.name,
          mimeType: entry.mimeType,
          size: entry.size,
          kind: entry.kind,
          text: "",
          dataUrl: (await attachmentAvailable(entry.id))
            ? `/api/chat/sessions/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(entry.id)}`
            : "",
        })),
    );
    messages.push({
      id: row.id,
      role: row.type,
      submissionId: row.metadata?.veykorSubmissionId || "",
      text: row.type === "user" ? row.text || "" : text.join("\n\n"),
      thinking: thinking.join("\n\n"),
      thoughtEntries,
      thinkingStartedAt: row.time.created,
      thinkingSeconds: row.time.completed
        ? Math.max(
            1,
            Math.round((row.time.completed - row.time.created) / 1000),
          )
        : 0,
      createdAt: row.time.created,
      usage: {
        inputTokens: row.tokens?.input || 0,
        outputTokens: row.tokens?.output || 0,
        cost: row.cost || 0,
        costAvailable: typeof row.cost === "number",
      },
      tools,
      attachments: files,
    });
  }

  return messages;
}
