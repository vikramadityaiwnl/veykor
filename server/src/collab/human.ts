import type { ChatAttachment } from "@veykor/shared";
import { readConversation } from "../chat/conversations.js";
import { activeTaskForSession, markDelivered, queueDelivery, readParticipant, terminalTaskStates } from "./store.js";
import { agentNameFor } from "./sessions.js";
import { publishEvent } from "./events.js";
import { transitionTask } from "./tasks.js";

function preview(text: string, length: number): string {
  const clean = text.replace(/\s+/g, " ").trim();

  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}

export function recordDelegateInstruction(input: {
  userId: number;
  delegateConversationId: string;
  text: string;
  attachments: Pick<
    ChatAttachment,
    "id" | "name" | "mimeType" | "size" | "kind"
  >[];
}) {
  const metadata = readConversation(input.userId, input.delegateConversationId);

  if (!metadata?.parentConversationId) {
    return;
  }

  const parentId = metadata.parentConversationId;
  const delegateName = agentNameFor(
    input.userId,
    input.delegateConversationId,
    "Delegate",
  );
  const participant = readParticipant(
    input.userId,
    parentId,
    input.delegateConversationId,
  );

  const attachmentNote =
    input.attachments.length > 0
      ? ` [${input.attachments.length} attachment(s): ${input.attachments.map((entry) => entry.name).join(", ")}]`
      : "";

  const event = publishEvent({
    userId: input.userId,
    parentConversationId: parentId,
    type: "human-instruction",
    sourceKind: "human",
    sourceConversationId: input.delegateConversationId,
    sourceName: "You",
    participantId: participant?.id || "",
    participantName: delegateName,
    title: `You gave ${delegateName} additional instructions`,
    body: `${preview(input.text, 500)}${attachmentNote}`,
    skipConversationIds: [input.delegateConversationId],
  });

  queueDelivery(input.userId, parentId, event.id, input.delegateConversationId);
  markDelivered(input.userId, event.id, input.delegateConversationId);

  const task = activeTaskForSession(input.userId, input.delegateConversationId);

  if (
    task &&
    task.parentConversationId === parentId &&
    task.state === "waiting-for-reply" &&
    !terminalTaskStates.has(task.state)
  ) {
    transitionTask(input.userId, task.id, { state: "running" });
  }
}

export function delegateDisplayName(
  userId: number,
  delegateConversationId: string,
): string {
  return agentNameFor(userId, delegateConversationId, "Delegate");
}
