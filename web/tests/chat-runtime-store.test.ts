import { test } from "node:test";
import assert from "node:assert/strict";
import { useChatSessionsStore } from "../src/workspace/chat-sessions-store";
import { emptyUsage } from "../src/workspace/chat-sessions-store";

test("backend snapshots replace streamed messages and restore native state without duplicate replies", () => {
  useChatSessionsStore.setState({ sessions: [], messages: {}, status: "idle" });
  const session = {
    id: "native-chat",
    title: "Persisted chat",
    projectId: null,
    sectionId: "chats-1",
    providerId: "muse",
    modelId: "muse-spark-1.3",
    nativeSessionId: "native-session",
    permissionMode: "promptUnmatched" as const,
    status: "running" as const,
    error: "",
    approvals: [],
    activities: [],
    messages: [
      {
        id: "reply",
        role: "assistant" as const,
        text: "Partial",
        createdAt: 1,
        usage: emptyUsage(),
        tools: [],
        attachments: [],
      },
    ],
  };
  useChatSessionsStore.getState().receive({ sessions: [session] });
  useChatSessionsStore.getState().receive({
    sessions: [
      {
        ...session,
        messages: [{ ...session.messages[0], text: "Partial answer" }],
      },
    ],
  });
  assert.equal(useChatSessionsStore.getState().messages[session.id].length, 1);
  assert.equal(
    useChatSessionsStore.getState().messages[session.id][0].text,
    "Partial answer",
  );
  assert.equal(
    useChatSessionsStore.getState().sessions[0].nativeSessionId,
    "native-session",
  );
});

test("metadata-only snapshots keep optimistic messages until native history arrives", () => {
  useChatSessionsStore.setState({ sessions: [], messages: {}, status: "idle" });
  useChatSessionsStore.setState({
    messages: {
      "pending-chat": [
        {
          id: "optimistic",
          role: "user",
          text: "Hello",
          createdAt: 1,
          usage: emptyUsage(),
          tools: [],
          attachments: [],
        },
      ],
    },
  });
  useChatSessionsStore.getState().receive({
    sessions: [
      {
        id: "pending-chat",
        title: "Pending chat",
        projectId: null,
        sectionId: "chats-1",
        providerId: "muse",
        modelId: "muse-spark-1.3",
        nativeSessionId: "",
        permissionMode: "promptUnmatched",
        status: "idle",
        error: "",
        approvals: [],
        activities: [],
        messages: [],
      },
    ],
  });
  assert.equal(
    useChatSessionsStore.getState().messages["pending-chat"][0].text,
    "Hello",
  );
});

test("stale history and open responses preserve a follow-up until native acknowledgement", async () => {
  const store = useChatSessionsStore;
  store.setState({ sessions: [], messages: {}, status: "ready" });
  const session = store.getState().createChatSession("chats-1");
  const original = {
    id: "old-user",
    role: "user" as const,
    text: "First",
    createdAt: 1,
    usage: emptyUsage(),
    tools: [],
    attachments: [],
  };
  store.setState({ messages: { [session.id]: [original] } });
  store.getState().addMessage(session.id, "Follow-up");
  const optimistic = store.getState().messages[session.id][1];
  store.getState().receive({ sessions: [] });
  assert.ok(store.getState().sessions.some((entry) => entry.id === session.id));
  store
    .getState()
    .receive({ sessions: [{ ...session, messages: [original] }] });
  assert.equal(store.getState().messages[session.id][1], optimistic);
  store.getState().receive({ sessions: [{ ...session, messages: [] }] });
  assert.equal(store.getState().messages[session.id][0], original);
  assert.equal(store.getState().messages[session.id][1], optimistic);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ session: { ...session, messages: [original] } }),
    );
  try {
    await store.getState().openSession(session.id);
    assert.equal(store.getState().messages[session.id][1], optimistic);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const native = { ...optimistic, id: "native-user" };
  store
    .getState()
    .receive({ sessions: [{ ...session, messages: [original, native] }] });
  const acknowledged = store.getState().messages[session.id];
  assert.equal(acknowledged.length, 2);
  assert.equal(acknowledged[1].id, optimistic.id);
  store
    .getState()
    .receive({ sessions: [{ ...session, messages: [original, native] }] });
  assert.equal(store.getState().messages[session.id][1], acknowledged[1]);
});

test("an older open response cannot roll back a newer live snapshot", async () => {
  const store = useChatSessionsStore;
  const session = store.getState().createChatSession("chats-1");
  let resolveResponse!: (response: Response) => void;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
  try {
    const opening = store.getState().openSession(session.id);
    const message = {
      id: "new-answer",
      role: "assistant" as const,
      text: "Latest answer",
      createdAt: 1,
      usage: emptyUsage(),
      tools: [],
      attachments: [],
    };
    store
      .getState()
      .receive({ sessions: [{ ...session, messages: [message] }] });
    resolveResponse(
      new Response(JSON.stringify({ session: { ...session, messages: [] } })),
    );
    await opening;
    assert.equal(
      store.getState().messages[session.id][0].text,
      "Latest answer",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
