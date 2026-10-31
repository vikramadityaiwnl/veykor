import { create } from "zustand";

export interface SessionMessage {
  id: string;
  text: string;
}

export interface ChatSession {
  id: string;
  title: string;
  projectId: string | null;
  sectionId: string | null;
}

interface ChatSessionsState {
  sessions: ChatSession[];
  messages: Record<string, SessionMessage[]>;
  activeSessionId: string | null;
  createChatSession: (sectionId: string) => ChatSession;
  createProjectSession: (projectId: string) => ChatSession;
  ensureChatSession: (sectionId: string) => ChatSession;
  ensureProjectSession: (projectId: string) => ChatSession;
  selectSession: (id: string | null) => void;
  addMessage: (sessionId: string, text: string) => void;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

export const useChatSessionsStore = create<ChatSessionsState>()((set, get) => ({
  sessions: [],
  messages: {},
  activeSessionId: null,

  createChatSession: (sectionId) => {
    const count = get().sessions.filter(
      (session) =>
        session.projectId === null && session.sectionId === sectionId,
    ).length;
    const session: ChatSession = {
      id: createId(),
      title: `Chat ${count + 1}`,
      projectId: null,
      sectionId,
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
    };

    set({
      sessions: [...get().sessions, session],
      messages: { ...get().messages, [session.id]: [] },
      activeSessionId: session.id,
    });

    return session;
  },

  ensureChatSession: (sectionId) => {
    const existing = get().sessions.find(
      (session) =>
        session.projectId === null &&
        session.sectionId === sectionId &&
        get().messages[session.id].length === 0,
    );

    if (existing) {
      set({ activeSessionId: existing.id });

      return existing;
    }

    return get().createChatSession(sectionId);
  },

  ensureProjectSession: (projectId) => {
    const existing = get().sessions.find(
      (session) =>
        session.projectId === projectId &&
        get().messages[session.id].length === 0,
    );

    if (existing) {
      set({ activeSessionId: existing.id });

      return existing;
    }

    return get().createProjectSession(projectId);
  },

  selectSession: (id) => {
    set({ activeSessionId: id });
  },

  addMessage: (sessionId, text) => {
    const message: SessionMessage = { id: createId(), text };

    set({
      messages: {
        ...get().messages,
        [sessionId]: [...get().messages[sessionId], message],
      },
    });
  },
}));
