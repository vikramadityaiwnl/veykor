import { test } from "node:test";
import assert from "node:assert/strict";
import { useAuthStore } from "../src/auth/auth-store";
import { useChatSessionsStore } from "../src/workspace/chat-sessions-store";
import { useChatRuntimeStore } from "../src/workspace/chat-runtime-store";

test("reply placeholder appears before the request completes; streamed tools and text persist without duplicate replies", async () => {
  const originalFetch = globalThis.fetch;
  let reply: (response: Response) => void = () => {};
  let saved: any;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/chat/sessions") {
      saved = JSON.parse(String(options?.body));
      return Response.json(saved);
    }
    return new Promise<Response>((resolve) => {
      reply = resolve;
    });
  };

  try {
    useAuthStore.setState({
      status: {
        user: { id: 1, username: "runtime-test", photo: null },
        expiresAt: 9999999999,
        registrationAllowed: true,
      },
    });
    useChatSessionsStore.setState({ status: "ready" });
    const session = useChatSessionsStore.getState().createChatSession("chats");
    useChatSessionsStore.getState().addMessage(session.id, "Hello");
    const running = useChatRuntimeStore.getState().send(session.id, {
      providerId: "muse",
      modelId: "muse-test",
      systemPrompt: "",
      messages: [{ role: "user", text: "Hello" }],
    });
    const optimistic = useChatSessionsStore.getState().messages[session.id];
    assert.equal(optimistic.length, 2);
    assert.equal(optimistic[1].role, "assistant");
    assert.equal(optimistic[1].text, "");
    assert.ok(optimistic[1].createdAt > 0);
    assert.equal(useChatRuntimeStore.getState().runningSessionId, session.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(saved.sessions[0].messages.length, 1);
    const events = [
      {
        type: "tool",
        tool: {
          id: "call-1",
          name: "read",
          target: "readme.md",
          status: "complete",
          result: "Contents",
          errorMessage: "",
        },
      },
      { type: "text", text: "Hello back" },
      { type: "done" },
    ];
    reply(
      new Response(
        events.map((event) => JSON.stringify(event)).join("\n") + "\n",
      ),
    );
    await running;
    const messages = useChatSessionsStore.getState().messages[session.id];
    assert.equal(messages.length, 2);
    assert.equal(messages[1].text, "Hello back");
    assert.equal(messages[1].tools[0].name, "read");
    assert.deepEqual(saved.sessions[0].messages, messages);
    assert.equal(useChatRuntimeStore.getState().runningSessionId, "");
  } finally {
    globalThis.fetch = originalFetch;
    useAuthStore.setState({ status: null });
  }
});

test("failed requests remove the optimistic empty reply instead of leaving a thinking message", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) =>
    url === "/api/chat/sessions"
      ? Response.json(JSON.parse(String(options?.body)))
      : Response.json({ error: "Provider unavailable" }, { status: 503 });

  try {
    useAuthStore.setState({
      status: {
        user: { id: 2, username: "failure-test", photo: null },
        expiresAt: 9999999999,
        registrationAllowed: true,
      },
    });
    useChatSessionsStore.setState({ status: "ready" });
    const session = useChatSessionsStore.getState().createChatSession("chats");
    useChatSessionsStore.getState().addMessage(session.id, "Hello");
    await useChatRuntimeStore.getState().send(session.id, {
      providerId: "muse",
      modelId: "muse-test",
      systemPrompt: "",
      messages: [{ role: "user", text: "Hello" }],
    });
    assert.equal(
      useChatSessionsStore.getState().messages[session.id].length,
      1,
    );
    assert.equal(useChatRuntimeStore.getState().error, "Provider unavailable");
    assert.equal(useChatRuntimeStore.getState().runningSessionId, "");
  } finally {
    globalThis.fetch = originalFetch;
    useAuthStore.setState({ status: null });
  }
});
