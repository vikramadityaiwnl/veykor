import { create } from "zustand";
import type { ChatRequest } from "@veykor/shared";
import { useChatSessionsStore } from "./chat-sessions-store";
import { watchChatSnapshots } from "./chat-live-connection";
import { useAuthStore } from "../auth/auth-store";

const pendingSubmissions = new Map<string, number>();

export type SubmissionErrorKind = "" | "rejected" | "uncertain";

export interface SubmissionInterruption {
  sessionId: string;
  taskId: string;
  state: string;
  interruptState: string;
}

interface ChatRuntimeState {
  runningSessionId: string;
  error: string;
  errorKind: SubmissionErrorKind;
  errorSessionId: string;
  lastInterruption: SubmissionInterruption | null;
  send: (sessionId: string, input: ChatRequest) => Promise<boolean>;
  stop: (sessionId?: string) => void;
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
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Muse request failed");
  }
}

async function wasAccepted(sessionId: string, messageId: string) {
  await useChatSessionsStore.getState().openSession(sessionId);
  const state = useChatSessionsStore.getState();
  const session = state.sessions.find((entry) => entry.id === sessionId);

  return (
    (session?.queuedMessages || []).some(
      (entry) => entry.clientMessageId === messageId,
    ) ||
    (state.messages[sessionId] || []).some(
      (entry) => entry.submissionId === messageId || entry.id === messageId,
    )
  );
}

export const useChatRuntimeStore = create<ChatRuntimeState>()((set, get) => ({
  runningSessionId: "",
  error: "",
  errorKind: "",
  errorSessionId: "",
  lastInterruption: null,
  stop: (sessionId) => {
    const id = sessionId || get().runningSessionId;
    if (id) {
      void chatAction(id, "stop", {}).catch((error) =>
        set({
          error: error.message,
          errorKind: "rejected",
          errorSessionId: id,
        }),
      );
    }
  },
  send: async (sessionId, input) => {
    pendingSubmissions.set(
      sessionId,
      (pendingSubmissions.get(sessionId) || 0) + 1,
    );
    set({
      runningSessionId: sessionId,
      error: "",
      errorKind: "",
      errorSessionId: "",
      lastInterruption: null,
    });
    try {
      const sessionsState = useChatSessionsStore.getState();
      const isInternal = !!sessionsState.internalSessions[sessionId];
      if (!isInternal) {
        await sessionsState.save();
      }
      const saved = useChatSessionsStore.getState();
      if (
        saved.error ||
        (!isInternal &&
          !saved.sessions.some((session) => session.id === sessionId))
      ) {
        throw Object.assign(
          new Error(
            saved.error ||
              "Unable to save this conversation. Please try again.",
          ),
          { kind: "rejected" as const },
        );
      }
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw Object.assign(
          new Error(payload.error || "Unable to send message"),
          { kind: "rejected" as const },
        );
      }
      const payload = (await response.json().catch(() => ({}))) as {
        interruption?: {
          taskId: string;
          state: string;
          interruptState: string;
        };
      };
      if (payload.interruption) {
        set({
          lastInterruption: {
            sessionId,
            taskId: payload.interruption.taskId,
            state: payload.interruption.state,
            interruptState: payload.interruption.interruptState,
          },
        });
      }
      return true;
    } catch (error) {
      const rejected =
        error instanceof Error &&
        (error as { kind?: string }).kind === "rejected";

      if (!rejected) {
        const accepted = await wasAccepted(sessionId, input.messageId).catch(
          () => false,
        );
        if (accepted) {
          return true;
        }
      }

      set({
        runningSessionId: "",
        errorSessionId: sessionId,
        errorKind: rejected ? "rejected" : "uncertain",
        error: rejected
          ? error instanceof Error
            ? error.message
            : "Unable to send message"
          : "Delivery is uncertain. Your message may already be queued, so it was not resent. Check the queue above; your text and images are still here if you need to send it manually.",
      });
      return false;
    } finally {
      const remaining = (pendingSubmissions.get(sessionId) || 1) - 1;
      if (remaining > 0) {
        pendingSubmissions.set(sessionId, remaining);
      } else {
        pendingSubmissions.delete(sessionId);
      }

      set({
        runningSessionId:
          useChatSessionsStore
            .getState()
            .sessions.find((session) => session.status === "running")?.id ||
          [...pendingSubmissions.keys()][0] ||
          "",
      });
    }
  },
}));

const stopSnapshots = watchChatSnapshots({
  isReady: () =>
    useChatSessionsStore.getState().status === "ready" &&
    typeof EventSource !== "undefined",
  subscribe: (listener) => useChatSessionsStore.subscribe(listener),
  createSource: (cursor) =>
    new EventSource(
      cursor
        ? `/api/chat/sessions/live?cursor=${encodeURIComponent(cursor)}`
        : "/api/chat/sessions/live",
    ),
  receive: (payload) => {
    useChatSessionsStore.getState().receive(payload);
    const running = payload.sessions.find(
      (session) => session.status === "running",
    );
    useChatRuntimeStore.setState({
      runningSessionId: running?.id || [...pendingSubmissions.keys()][0] || "",
    });
  },
});

const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    pendingSubmissions.clear();
    useChatRuntimeStore.setState({
      runningSessionId: "",
      error: "",
      errorKind: "",
      errorSessionId: "",
      lastInterruption: null,
    });
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopSnapshots();
    unsubscribeAuth();
  });
}
