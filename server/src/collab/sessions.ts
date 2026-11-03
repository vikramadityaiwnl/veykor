import { randomUUID } from "node:crypto";
import type { Agent, ChatModel } from "@veykor/shared";
import { readAgent } from "../agents/store.js";
import { buildAgentSnapshot } from "../agents/agent-config.js";
import { deleteConversation, listInternalConversations, readConversation, writeConversation } from "../chat/conversations.js";
import { getSettings } from "../settings/settings.js";
import { insertParticipant, participantForAgent } from "./store.js";
import { maxDelegatesPerChat } from "./limits.js";

export function parentOf(
  userId: number,
  conversationId: string,
): { parentId: string; isInternal: boolean } | undefined {
  const metadata = readConversation(userId, conversationId);

  if (!metadata) {
    return undefined;
  }

  if (metadata.parentConversationId) {
    return { parentId: metadata.parentConversationId, isInternal: true };
  }

  return { parentId: metadata.id, isInternal: false };
}

export async function ensureLeadParticipant(userId: number, parentId: string) {
  const parent = readConversation(userId, parentId);

  if (!parent || parent.parentConversationId || !parent.projectId) {
    throw new Error("Collaboration needs a project chat");
  }

  const agentId = parent.agentSnapshot?.agentId || parent.agentId || "";
  const agentName = parent.agentSnapshot?.name || parent.agentName || "Lead";

  return insertParticipant({
    userId,
    parentConversationId: parentId,
    conversationId: parentId,
    agentId,
    agentName,
    role: "lead",
  });
}

export interface DelegateSession {
  conversationId: string;
  participantId: string;
  reusedSession: boolean;
}

export interface DelegateCatalog {
  available: boolean;
  error: string;
  models: {
    id: string;
    reasoningEfforts: { tier: string }[];
    defaultReasoningEffort: string;
  }[];
}

export async function ensureDelegateSession(
  userId: number,
  parentId: string,
  agent: Agent,
  catalogOverride?: DelegateCatalog,
): Promise<DelegateSession> {
  const parent = readConversation(userId, parentId);

  if (!parent || parent.parentConversationId) {
    throw new Error("Conversation not found");
  }

  if (!parent.projectId || !agent.projectIds.includes(parent.projectId)) {
    throw new Error("Agent is not available for this project");
  }

  if (agent.providerId !== "muse") {
    throw new Error(
      `${agent.name} uses ${agent.providerId === "opencode" ? "OpenCode" : agent.providerId}, which cannot expose collaboration tools yet. Use a Muse Code agent as a delegate.`,
    );
  }

  const existing = participantForAgent(userId, parentId, agent.id);

  if (existing && existing.role === "delegate") {
    const metadata = readConversation(userId, existing.conversationId);

    if (metadata && !metadata.parentConversationId) {
      throw new Error("Delegate session is no longer linked");
    }

    if (metadata) {
      return {
        conversationId: metadata.id,
        participantId: existing.id,
        reusedSession: true,
      };
    }
  }

  const delegates = listInternalConversations(userId, parentId);

  if (delegates.length >= maxDelegatesPerChat) {
    throw new Error(
      `This chat already has ${maxDelegatesPerChat} delegates, which is the v1 limit`,
    );
  }

  const settings = catalogOverride
    ? { providers: [{ id: agent.providerId, ...catalogOverride }] }
    : await getSettings();
  const catalog = settings.providers.find(
    (entry) => entry.id === agent.providerId,
  );
  const model = catalog?.models.find(
    (entry: { id: string }) => entry.id === agent.modelId,
  ) as ChatModel | undefined;

  if (!catalog?.available || !model) {
    throw new Error(catalog?.error || "Agent model unavailable");
  }

  const snapshot = buildAgentSnapshot(agent, model);
  const id = randomUUID();

  writeConversation(userId, {
    id,
    title: `${agent.name} for ${parent.title || "project chat"}`.slice(0, 200),
    projectId: parent.projectId,
    sectionId: null,
    providerId: snapshot.providerId,
    modelId: snapshot.modelId,
    reasoningEffort: snapshot.reasoningEffort,
    nativeSessionId: "",
    permissionMode: snapshot.permissionMode,
    agentId: agent.id,
    agentName: snapshot.name,
    agentSnapshot: snapshot,
    parentConversationId: parentId,
    collabRole: "delegate",
    attachments: [],
    turnTimings: {},
  });

  await ensureLeadParticipant(userId, parentId);

  const participant = insertParticipant({
    userId,
    parentConversationId: parentId,
    conversationId: id,
    agentId: agent.id,
    agentName: agent.name,
    role: "delegate",
  });

  return {
    conversationId: id,
    participantId: participant.id,
    reusedSession: false,
  };
}

export function agentNameFor(
  userId: number,
  conversationId: string,
  fallback: string,
): string {
  const metadata = readConversation(userId, conversationId);

  if (!metadata) {
    return fallback;
  }

  if (metadata.parentConversationId) {
    return metadata.agentSnapshot?.name || metadata.agentName || fallback;
  }

  return metadata.agentSnapshot?.name || metadata.agentName || "Lead";
}

export function resolveDelegateAgent(
  userId: number,
  parentId: string,
  agentId: string,
): Agent {
  const agent = readAgent(userId, agentId);

  if (!agent) {
    throw new Error("Agent not found");
  }

  const parent = readConversation(userId, parentId);

  if (!parent?.projectId || !agent.projectIds.includes(parent.projectId)) {
    throw new Error("Agent is not available for this project");
  }

  return agent;
}

export function deleteInternalSessions(userId: number, parentId: string) {
  for (const metadata of listInternalConversations(userId, parentId)) {
    deleteConversation(userId, metadata.id);
  }
}
