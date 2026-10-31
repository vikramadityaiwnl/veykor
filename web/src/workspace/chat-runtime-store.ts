import { create } from "zustand";
import type { ChatEvent, ChatRequest } from "@veykor/shared";
import { useChatSessionsStore } from "./chat-sessions-store";
import { useAuthStore } from "../auth/auth-store";

interface ChatRuntimeState {
  runningSessionId: string;
  error: string;
  errorSessionId: string;
  send: (sessionId: string, input: ChatRequest) => Promise<void>;
  stop: () => void;
}

let controller: AbortController | undefined;

export const useChatRuntimeStore = create<ChatRuntimeState>()((set, get) => ({
  runningSessionId: "",
  error: "",
  errorSessionId: "",
  stop: () => controller?.abort(),
  send: async (sessionId, input) => {
    if (get().runningSessionId) {
      return;
    }
    const userId = useAuthStore.getState().status?.user?.id;
    const requestController = new AbortController();
    controller = requestController;
    set({ runningSessionId: sessionId, error: "", errorSessionId: "" });
    const replyId = useChatSessionsStore.getState().addReply(sessionId);
    let done = false;

    function event(value: ChatEvent) {
      if (useAuthStore.getState().status?.user?.id !== userId) {
        requestController.abort();
        return;
      }
      if (value.type === "error") {
        throw new Error(value.message);
      }
      if (value.type === "text" || value.type === "usage") {
        useChatSessionsStore
          .getState()
          .updateReply(
            sessionId,
            replyId,
            value.type === "text" ? value.text : "",
            value.type === "usage" ? value.usage : undefined,
          );
      }
      if (value.type === "tool") {
        useChatSessionsStore
          .getState()
          .updateTool(sessionId, replyId, value.tool);
      }
      if (value.type === "done") {
        done = true;
      }
    }

    try {
      await useChatSessionsStore.getState().save();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
        },
        body: JSON.stringify(input),
        signal: requestController.signal,
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Unable to send message");
      }
      if (!response.body) {
        throw new Error("No response stream received");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      try {
        while (true) {
          const chunk = await reader.read();
          pending += chunk.done
            ? decoder.decode()
            : decoder.decode(chunk.value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim()) {
              event(JSON.parse(line) as ChatEvent);
            }
          }
          if (chunk.done) {
            break;
          }
        }
        if (pending.trim()) {
          event(JSON.parse(pending) as ChatEvent);
        }
        if (!done) {
          throw new Error(
            "The connection ended before the reply completed. Please retry.",
          );
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch (error) {
      if (useAuthStore.getState().status?.user?.id === userId) {
        set({
          errorSessionId: sessionId,
          error: requestController.signal.aborted
            ? "Generation stopped. Any partial reply has been kept."
            : error instanceof Error
              ? error.message
              : "Unable to send message",
        });
      }
    } finally {
      if (useAuthStore.getState().status?.user?.id === userId) {
        useChatSessionsStore.getState().finishReply(sessionId, replyId);
        await useChatSessionsStore.getState().save();
      }
      controller = undefined;
      set({ runningSessionId: "" });
    }
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    controller?.abort();
    useChatRuntimeStore.setState({ error: "", errorSessionId: "" });
  }
});
