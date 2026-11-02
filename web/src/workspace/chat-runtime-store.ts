import { create } from "zustand";
import type { ChatRequest } from "@veykor/shared";
import { useChatSessionsStore } from "./chat-sessions-store";
import { watchChatSnapshots } from "./chat-live-connection";
import { useAuthStore } from "../auth/auth-store";

const pendingSubmissions = new Set<string>();

interface ChatRuntimeState {
  runningSessionId: string;
  error: string;
  errorSessionId: string;
  send: (sessionId: string, input: ChatRequest) => Promise<void>;
  stop: () => void;
}

export async function chatAction(
  sessionId: string,
  action: string,
  input: unknown,
) {
  const response = await fetch(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Veykor-Request": "1" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "Muse request failed");
  }
}

export const useChatRuntimeStore = create<ChatRuntimeState>()((set, get) => ({
  runningSessionId: "",
  error: "",
  errorSessionId: "",
  stop: () => {
    const id = get().runningSessionId;
    if (id) {
      void chatAction(id, "stop", {}).catch((error) =>
        set({ error: error.message, errorSessionId: id }),
      );
    }
  },
  send: async (sessionId, input) => {
    pendingSubmissions.add(sessionId);
    set({ runningSessionId: sessionId, error: "", errorSessionId: "" });
    try {
      await useChatSessionsStore.getState().save();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Unable to send message");
      }
    } catch (error) {
      set({
        runningSessionId: "",
        errorSessionId: sessionId,
        error:
          error instanceof Error ? error.message : "Unable to send message",
      });
    } finally {
      pendingSubmissions.delete(sessionId);
    }
  },
}));

const stopSnapshots = watchChatSnapshots({
  isReady: () =>
    useChatSessionsStore.getState().status === "ready" &&
    typeof EventSource !== "undefined",
  subscribe: (listener) => useChatSessionsStore.subscribe(listener),
  createSource: () => new EventSource("/api/chat/sessions/live"),
  receive: (payload) => {
    useChatSessionsStore.getState().receive(payload);
    const running = payload.sessions.find(
      (session) => session.status === "running",
    );
    useChatRuntimeStore.setState({
      runningSessionId: running?.id || [...pendingSubmissions][0] || "",
    });
  },
});

const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    pendingSubmissions.clear();
    useChatRuntimeStore.setState({
      runningSessionId: "",
      error: "",
      errorSessionId: "",
    });
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopSnapshots();
    unsubscribeAuth();
  });
}
