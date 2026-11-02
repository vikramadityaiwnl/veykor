import { create } from "zustand";
import type { QueuedChatMessage, ChatAttachment, ChatMessage, ChatUsage, ChatSessionsResponse, ChatSession as SavedChatSession } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

export type SessionMessage = ChatMessage;

export type ChatSession = Omit<SavedChatSession, "messages">;

interface ChatSessionsState {
  sessions: ChatSession[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  load: () => Promise<void>;
  receive: (payload: ChatSessionsResponse) => void;
  openSession: (sessionId: string) => Promise<void>;
  save: () => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  configure: (
    sessionId: string,
    providerId: string,
    modelId: string,
    reasoningEffort?: ChatSession["reasoningEffort"],
    permissionMode?: ChatSession["permissionMode"],
  ) => void;
  messages: Record<string, SessionMessage[]>;
  activeSessionId: string | null;
  createChatSession: (sectionId: string) => ChatSession;
  createProjectSession: (projectId: string) => ChatSession;
  selectSession: (id: string | null) => void;
  addMessage: (
    sessionId: string,
    text: string,
    attachments?: ChatAttachment[],
  ) => void;
}

let loadVersion = 0;
let saveQueue = Promise.resolve();

export function emptyUsage(): ChatUsage {
  return { inputTokens: 0, outputTokens: 0, cost: 0, costAvailable: false };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

const optimisticMessages = new Map<
  string,
  { message: SessionMessage; userCount: number }
>();
const messageAliases = new Map<string, string>();

function reconcileMessages(
  sessionId: string,
  incoming: SessionMessage[],
  current: SessionMessage[],
  queued: QueuedChatMessage[] = [],
): SessionMessage[] {
  let pending = optimisticMessages.get(sessionId);
  if (
    pending &&
    queued.some((entry) => entry.clientMessageId === pending!.message.id)
  ) {
    current = current.filter((message) => message.id !== pending!.message.id);
    optimisticMessages.delete(sessionId);
    pending = undefined;
  }
  const users = incoming.filter((message) => message.role === "user");
  if (pending && users.length > pending.userCount) {
    const acknowledged = users[pending.userCount];
    if (acknowledged.text === pending.message.text) {
      messageAliases.set(acknowledged.id, pending.message.id);
      optimisticMessages.delete(sessionId);
    }
  }
  const existing = new Map(current.map((message) => [message.id, message]));
  const messages = incoming.map((message) => {
    const next = {
      ...message,
      id: messageAliases.get(message.id) || message.id,
    };
    const previous = existing.get(next.id);
    return previous && JSON.stringify(previous) === JSON.stringify(next)
      ? previous
      : next;
  });
  const remaining = optimisticMessages.get(sessionId);
  if (remaining) {
    return [
      ...(incoming.length
        ? messages
        : current.filter((message) => message.id !== remaining.message.id)),
      remaining.message,
    ];
  }
  return incoming.length ? messages : current;
}

function sessionMetadata(session: SavedChatSession): ChatSession {
  return {
    id: session.id,
    title: session.title,
    projectId: session.projectId,
    sectionId: session.sectionId,
    providerId: session.providerId,
    modelId: session.modelId,
    reasoningEffort: session.reasoningEffort,
    nativeSessionId: session.nativeSessionId || "",
    permissionMode: session.permissionMode || "promptUnmatched",
    status: session.status || "idle",
    error: session.error || "",
    approvals: session.approvals || [],
    activities: session.activities || [],
    queuedMessages: session.queuedMessages || [],
    queuePaused: session.queuePaused || false,
  };
}

export const useChatSessionsStore = create<ChatSessionsState>()((set, get) => ({
  receive: (payload) => {
    set({
      sessions: [
        ...payload.sessions.map(sessionMetadata),
        ...get().sessions.filter(
          (session) =>
            !payload.sessions.some((saved) => saved.id === session.id) &&
            (!get().messages[session.id]?.length ||
              optimisticMessages.has(session.id)),
        ),
      ],
      messages: {
        ...get().messages,
        ...Object.fromEntries(
          payload.sessions.map((session) => [
            session.id,
            reconcileMessages(
              session.id,
              session.messages,
              get().messages[session.id] || [],
              session.queuedMessages || [],
            ),
          ]),
        ),
      },
    });
  },
  openSession: async (sessionId) => {
    const userId = useAuthStore.getState().status?.user?.id;
    const messagesAtStart = get().messages[sessionId];
    try {
      const response = await fetch(
        `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
      );
      if (!response.ok) {
        throw new Error("Unable to open conversation");
      }
      const payload = (await response.json()) as { session: SavedChatSession };
      if (
        useAuthStore.getState().status?.user?.id !== userId ||
        get().messages[sessionId] !== messagesAtStart
      ) {
        return;
      }
      set({
        sessions: get().sessions.map((session) =>
          session.id === sessionId ? sessionMetadata(payload.session) : session,
        ),
        messages: {
          ...get().messages,
          [sessionId]: reconcileMessages(
            sessionId,
            payload.session.messages,
            get().messages[sessionId] || [],
            payload.session.queuedMessages || [],
          ),
        },
      });
    } catch {
      return;
    }
  },
  sessions: [],
  status: "idle",
  error: "",
  load: async () => {
    const version = ++loadVersion;
    set({
      sessions: [],
      messages: {},
      activeSessionId: null,
      status: "loading",
      error: "",
    });
    try {
      const response = await fetch("/api/chat/sessions");
      if (!response.ok) {
        throw new Error("Unable to load conversations");
      }
      const payload = (await response.json()) as ChatSessionsResponse;
      if (version !== loadVersion) {
        return;
      }
      set({
        sessions: payload.sessions.map(sessionMetadata),
        messages: Object.fromEntries(
          payload.sessions.map((session) => [
            session.id,
            session.messages.map((message) => ({
              ...message,
              createdAt: message.createdAt ?? 0,
              tools: message.tools ?? [],
              attachments: message.attachments ?? [],
            })),
          ]),
        ),
        status: "ready",
      });
    } catch (error) {
      console.error("Unable to load conversations", error);
      if (version === loadVersion) {
        set({
          status: "error",
          error: "Unable to load conversations. Reload to retry.",
        });
      }
    }
  },
  save: async () => {
    if (get().status !== "ready") {
      return;
    }
    const userId = useAuthStore.getState().status?.user?.id;
    const snapshot = JSON.stringify({ sessions: get().sessions });
    saveQueue = saveQueue
      .catch(() => {})
      .then(async () => {
        if (useAuthStore.getState().status?.user?.id !== userId) {
          return;
        }
        const response = await fetch("/api/chat/sessions", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Veykor-Request": "1",
          },
          body: snapshot,
        });
        if (!response.ok) {
          throw new Error("Unable to save conversation");
        }
      });
    try {
      await saveQueue;
      if (useAuthStore.getState().status?.user?.id === userId) {
        set({ error: "" });
      }
    } catch {
      if (useAuthStore.getState().status?.user?.id === userId) {
        set({
          error:
            "Conversation could not be saved. Your messages are still available until you reload.",
        });
      }
    }
  },
  renameSession: async (sessionId, title) => {
    const name = title.trim();
    const original = get().sessions.find((session) => session.id === sessionId);

    if (!name || name.length > 200 || !original || get().status !== "ready") {
      return false;
    }

    set({
      sessions: get().sessions.map((session) =>
        session.id === sessionId ? { ...session, title: name } : session,
      ),
    });
    const userId = useAuthStore.getState().status?.user?.id;
    await get().save();

    if (useAuthStore.getState().status?.user?.id !== userId) {
      return false;
    }

    if (get().error) {
      set({
        sessions: get().sessions.map((session) =>
          session.id === sessionId && session.title === name
            ? { ...session, title: original.title }
            : session,
        ),
      });
      return false;
    }

    return true;
  },
  deleteSession: async (sessionId) => {
    const original = get().sessions.find((session) => session.id === sessionId);

    if (!original || get().status !== "ready") {
      return false;
    }

    const index = get().sessions.indexOf(original);
    const originalMessages = get().messages[sessionId];
    const messages = { ...get().messages };
    delete messages[sessionId];

    set({
      sessions: get().sessions.filter((session) => session.id !== sessionId),
      messages,
    });
    const userId = useAuthStore.getState().status?.user?.id;
    const response = await fetch(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE", headers: { "X-Veykor-Request": "1" } },
    );
    if (!response.ok) {
      set({
        error: "Unable to delete conversation. Stop any running turn first.",
      });
    }

    if (useAuthStore.getState().status?.user?.id !== userId) {
      return false;
    }

    if (get().error) {
      const sessions = [...get().sessions];
      sessions.splice(index, 0, original);
      set({
        sessions,
        messages: { ...get().messages, [sessionId]: originalMessages },
      });
      return false;
    }

    set({
      activeSessionId:
        get().activeSessionId === sessionId ? null : get().activeSessionId,
    });
    return true;
  },
  configure: (
    sessionId,
    providerId,
    modelId,
    reasoningEffort,
    permissionMode,
  ) => {
    set({
      sessions: get().sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              providerId,
              modelId,
              ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
              ...(permissionMode !== undefined ? { permissionMode } : {}),
            }
          : session,
      ),
    });
    void get().save();
  },
  messages: {},
  activeSessionId: null,

  createChatSession: (sectionId) => {
    const session: ChatSession = {
      id: createId(),
      title: "New Chat",
      projectId: null,
      sectionId,
      providerId: "",
      modelId: "",
    };

    set({
      sessions: [...get().sessions, session],
      messages: { ...get().messages, [session.id]: [] },
      activeSessionId: session.id,
    });

    return session;
  },

  createProjectSession: (projectId) => {
    const count = get().sessions.filter(
      (session) => session.projectId === projectId,
    ).length;
    const session: ChatSession = {
      id: createId(),
      title: `Session ${count + 1}`,
      projectId,
      sectionId: null,
      providerId: "",
      modelId: "",
    };

    set({
      sessions: [...get().sessions, session],
      messages: { ...get().messages, [session.id]: [] },
      activeSessionId: session.id,
    });

    return session;
  },

  selectSession: (id) => {
    set({ activeSessionId: id });
  },

  addMessage: (sessionId, text, attachments = []) => {
    const message: SessionMessage = {
      id: createId(),
      text,
      role: "user",
      usage: emptyUsage(),
      createdAt: Date.now(),
      tools: [],
      attachments,
    };

    optimisticMessages.set(sessionId, {
      message,
      userCount: get().messages[sessionId].filter(
        (entry) => entry.role === "user",
      ).length,
    });

    set({
      sessions: get().sessions.map((session) =>
        session.id === sessionId &&
        get().messages[sessionId].length === 0 &&
        (session.title === "New Chat" || /^Session \d+$/.test(session.title))
          ? { ...session, title: text.slice(0, 60) }
          : session,
      ),
      messages: {
        ...get().messages,
        [sessionId]: [...get().messages[sessionId], message],
      },
    });
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;
    optimisticMessages.clear();
    messageAliases.clear();
    useChatSessionsStore.setState({
      sessions: [],
      messages: {},
      activeSessionId: null,
      status: "idle",
      error: "",
    });
  }
});
