import { create } from "zustand";
import type { ChatMessage, ChatToolCall, ChatUsage, ChatSessionsResponse, ChatSession as SavedChatSession } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

export type SessionMessage = ChatMessage;

export type ChatSession = Omit<SavedChatSession, "messages">;

interface ChatSessionsState {
  sessions: ChatSession[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  load: () => Promise<void>;
  save: () => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  configure: (sessionId: string, providerId: string, modelId: string) => void;
  updateReply: (
    sessionId: string,
    messageId: string,
    text: string,
    usage?: ChatUsage,
  ) => void;
  updateTool: (
    sessionId: string,
    messageId: string,
    tool: ChatToolCall,
  ) => void;
  finishReply: (sessionId: string, messageId: string) => void;
  addReply: (sessionId: string) => string;
  messages: Record<string, SessionMessage[]>;
  activeSessionId: string | null;
  createChatSession: (sectionId: string) => ChatSession;
  createProjectSession: (projectId: string) => ChatSession;
  selectSession: (id: string | null) => void;
  addMessage: (sessionId: string, text: string) => void;
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

export const useChatSessionsStore = create<ChatSessionsState>()((set, get) => ({
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
        sessions: payload.sessions.map(
          ({ messages: _, ...session }) => session,
        ),
        messages: Object.fromEntries(
          payload.sessions.map((session) => [session.id, session.messages]),
        ),
        status: "ready",
      });
    } catch {
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
    const snapshot = JSON.stringify({
      sessions: get().sessions.map((session) => ({
        ...session,
        messages: get().messages[session.id].filter(
          (message) =>
            message.role === "user" || message.text || message.tools.length > 0,
        ),
      })),
    });
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
    const { [sessionId]: removed, ...messages } = get().messages;

    set({
      sessions: get().sessions.filter((session) => session.id !== sessionId),
      messages,
    });
    const userId = useAuthStore.getState().status?.user?.id;
    await get().save();

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
  configure: (sessionId, providerId, modelId) => {
    set({
      sessions: get().sessions.map((session) =>
        session.id === sessionId
          ? { ...session, providerId, modelId }
          : session,
      ),
    });
    void get().save();
  },
  addReply: (sessionId) => {
    const id = createId();
    set({
      messages: {
        ...get().messages,
        [sessionId]: [
          ...get().messages[sessionId],
          {
            id,
            role: "assistant",
            text: "",
            usage: emptyUsage(),
            createdAt: Date.now(),
            tools: [],
          },
        ],
      },
    });
    return id;
  },
  updateTool: (sessionId, messageId, tool) => {
    const messages = get().messages[sessionId];
    if (!messages) {
      return;
    }
    set({
      messages: {
        ...get().messages,
        [sessionId]: messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                tools: message.tools.some((entry) => entry.id === tool.id)
                  ? message.tools.map((entry) =>
                      entry.id === tool.id ? tool : entry,
                    )
                  : [...message.tools, tool],
              }
            : message,
        ),
      },
    });
  },
  finishReply: (sessionId, messageId) => {
    const messages = get().messages[sessionId];
    if (!messages) {
      return;
    }
    set({
      messages: {
        ...get().messages,
        [sessionId]: messages
          .filter(
            (message) =>
              message.id !== messageId ||
              message.text ||
              message.tools.length > 0,
          )
          .map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  tools: message.tools.map((tool) =>
                    tool.status === "running" || tool.status === "pending"
                      ? {
                          ...tool,
                          status: "error",
                          errorMessage:
                            "Tool execution ended before completion",
                        }
                      : tool,
                  ),
                }
              : message,
          ),
      },
    });
  },
  updateReply: (sessionId, messageId, text, usage) => {
    if (!get().messages[sessionId]) {
      return;
    }
    set({
      messages: {
        ...get().messages,
        [sessionId]: get().messages[sessionId].map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: message.text + text,
                usage: usage ?? message.usage,
              }
            : message,
        ),
      },
    });
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

  addMessage: (sessionId, text) => {
    const message: SessionMessage = {
      id: createId(),
      text,
      role: "user",
      usage: emptyUsage(),
      createdAt: Date.now(),
      tools: [],
    };

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
    useChatSessionsStore.setState({
      sessions: [],
      messages: {},
      activeSessionId: null,
      status: "idle",
      error: "",
    });
  }
});
