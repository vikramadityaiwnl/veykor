import { test } from "node:test";
import assert from "node:assert/strict";
import { useChatSessionsStore } from "../src/workspace/chat-sessions-store";
import { useChatRuntimeStore } from "../src/workspace/chat-runtime-store";
import type { ChatRequest } from "@veykor/shared";

const input: ChatRequest = {
  conversationId: "fast-chat",
  messageId: "message",
  providerId: "muse",
  modelId: "muse-wonder-1.0",
  permissionMode: "promptUnmatched",
  reasoningEffort: "high",
  messages: [{ role: "user", text: "Hello" }],
  systemPrompt: "",
};

test("a completed snapshot before the send response does not leave Thinking active", async () => {
  const previous = useChatSessionsStore.getState();
  const originalFetch = globalThis.fetch;
  let finish!: (response: Response) => void;
  globalThis.fetch = async () =>
    new Promise<Response>((resolve) => {
      finish = resolve;
    });
  useChatSessionsStore.setState({
    sessions: [
      {
        id: "fast-chat",
        title: "Fast chat",
        projectId: null,
        sectionId: "chats",
        providerId: "muse",
        modelId: input.modelId,
        status: "idle",
      },
    ],
    status: "ready",
    error: "",
    save: async () => {},
  });
  try {
    const submitted = useChatRuntimeStore.getState().send("fast-chat", input);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(useChatRuntimeStore.getState().runningSessionId, "fast-chat");
    finish(new Response("{}", { status: 202 }));
    assert.equal(await submitted, true);
    assert.equal(useChatRuntimeStore.getState().runningSessionId, "");
  } finally {
    globalThis.fetch = originalFetch;
    useChatSessionsStore.setState(previous);
  }
});

test("a failed metadata save prevents sending to a nonexistent conversation", async () => {
  const previous = useChatSessionsStore.getState();
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response("{}", { status: 202 });
  };
  useChatSessionsStore.setState({
    sessions: [
      {
        id: "fast-chat",
        title: "Fast chat",
        projectId: null,
        sectionId: "chats",
        providerId: "muse",
        modelId: input.modelId,
      },
    ],
    status: "ready",
    save: async () => {
      useChatSessionsStore.setState({
        error: "Conversation could not be saved",
      });
    },
  });
  try {
    assert.equal(
      await useChatRuntimeStore.getState().send("fast-chat", input),
      false,
    );
    assert.equal(requests, 0);
    assert.equal(
      useChatRuntimeStore.getState().error,
      "Conversation could not be saved",
    );
  } finally {
    globalThis.fetch = originalFetch;
    useChatSessionsStore.setState(previous);
  }
});
