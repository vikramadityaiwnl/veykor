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
