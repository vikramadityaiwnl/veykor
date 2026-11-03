import type { CollabDetailResponse, CollabSessionState, CollabSnapshot } from "@veykor/shared";
import { readConversation } from "../chat/conversations.js";
import { withQueue } from "../chat/message-queue.js";
import { chatProviderFor } from "../providers/index.js";
import { listDeliveries, listEvents, listParticipants, listTasks, pendingDeliveryCount } from "./store.js";
import { maxDelegatesPerChat, maxEventsPerChat, maxTasksPerChat } from "./limits.js";

export function buildSnapshot(
  userId: number,
  parentConversationId: string,
): CollabSnapshot | undefined {
  const parent = readConversation(userId, parentConversationId);

  if (!parent || parent.parentConversationId || !parent.projectId) {
    return undefined;
  }

  const participants = listParticipants(userId, parentConversationId);
  const nameFor = (conversationId: string) =>
    conversationId === parentConversationId
      ? parent.agentSnapshot?.name || parent.agentName || "Lead"
      : participants.find((entry) => entry.conversationId === conversationId)
          ?.agentName ||
        readConversation(userId, conversationId)?.agentName ||
        "Delegate";

  const pendingByConversation: Record<string, number> = {};

  for (const participant of participants) {
    pendingByConversation[participant.conversationId] = pendingDeliveryCount(
      userId,
      participant.conversationId,
    );
  }

  return {
    active: participants.length > 0,
    parentConversationId,
    projectId: parent.projectId,
    participants,
    tasks: listTasks(userId, parentConversationId),
    events: listEvents(userId, parentConversationId).slice(-200),
    deliveries: listDeliveries(userId, parentConversationId, nameFor),
    pendingByConversation,
    limits: {
      maxDelegates: maxDelegatesPerChat,
      maxTasks: maxTasksPerChat,
      maxEvents: maxEventsPerChat,
    },
  };
}

export async function buildDetail(
  userId: number,
  parentConversationId: string,
): Promise<CollabDetailResponse | undefined> {
  const snapshot = buildSnapshot(userId, parentConversationId);

  if (!snapshot) {
    return undefined;
  }

  const sessions: CollabSessionState[] = [];

  for (const participant of snapshot.participants) {
    if (participant.role === "lead") {
      continue;
    }

    const metadata = readConversation(userId, participant.conversationId);

    if (!metadata) {
      continue;
    }

    const provider = chatProviderFor(metadata.providerId);
    const session =
      (await provider
        ?.open(userId, participant.conversationId)
        .catch(() => undefined)) || undefined;

    if (!session) {
      continue;
    }

    sessions.push({
      session: withQueue(userId, session),
      agentSnapshot: metadata.agentSnapshot || null,
    });
  }

  return { snapshot, sessions };
}
