import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { useChatStore } from "../src/chat/chat-store.ts";
import { useWorkStore } from "../src/work/work-store.ts";
import { usePreferencesStore } from "../src/workspace/preferences-store.ts";
import { defaultPreferences } from "@veykor/shared";

function detail() {
  return {
    chat: {
      id: "created",
      title: "Untitled chat",
      projectId: "",
      agentId: "",
      agentName: "",
      sectionId: "recent",
      museSessionId: "native",
      running: false,
      createdAt: "",
      updatedAt: "",
    },
    items: [],
    turnDurations: {},
    pendingApprovals: [],
    pendingQuestions: [],
    recentQuestions: [],
    generatedImages: [],
    activeTurnId: "",
    activeTurnStartedAt: 0,
    running: false,
    modelId: "",
    providerId: "",
    reasoningEffort: "",
    permission: "read-only" as const,
  };
}

async function flush() {
  for (let index = 0; index < 8; index += 1) {
    await setImmediate();
  }
}

test("first send shows feedback before creation and retains incremental events against stale watchers", async () => {
  const originalFetch = globalThis.fetch;
  let resolveCreation!: (response: Response) => void;
  const creation = new Promise<Response>((resolve) => {
    resolveCreation = resolve;
  });
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const created = detail();
  globalThis.fetch = async (input, init) => {
    const url = String(input);

    if (url === "/api/chats") {
      return init?.method === "POST" ? creation : Response.json([created.chat]);
    }

    if (url.endsWith("/turns")) {
      return new Response(
        new ReadableStream({
          start(controller) {
            stream = controller;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }

    return Response.json(created);
  };

  try {
    usePreferencesStore.setState(defaultPreferences());
    useWorkStore.setState({ projectId: "", agentId: "" });
    useChatStore.getState().startDraft("recent");
    const sending = useChatStore.getState().send("Immediate feedback");
    assert.equal(useChatStore.getState().streaming, true);
    assert.equal(useChatStore.getState().activeChatId, null);
    assert.equal(useChatStore.getState().items[0].text, "Immediate feedback");

    resolveCreation(Response.json(created));
    await flush();
    assert.equal(useChatStore.getState().items[0].text, "Immediate feedback");
    useChatStore.getState().syncChat(created);
    assert.equal(useChatStore.getState().streaming, true);
    assert.equal(useChatStore.getState().items.length, 1);

    const event = (data: unknown) =>
      stream.enqueue(
        encoder.encode(`event: message\ndata: ${JSON.stringify(data)}\n\n`),
      );
    event({ type: "turn-started", turnId: "turn" });
    event({
      type: "item",
      item: {
        ...useChatStore.getState().items[0],
        itemId: "user",
        turnId: "turn",
      },
    });
    event({
      type: "item",
      item: {
        ...useChatStore.getState().items[0],
        itemId: "assistant",
        kind: "agentMessage",
        turnId: "turn",
        text: "",
        status: "inProgress",
      },
    });
    event({
      type: "delta",
      itemId: "assistant",
      field: "text",
      delta: "Live response",
    });
    await flush();
    assert.equal(useChatStore.getState().streaming, true);
    assert.equal(
      useChatStore
        .getState()
        .items.filter((item) => item.kind === "userMessage").length,
      1,
    );
    assert.equal(
      useChatStore.getState().items.find((item) => item.itemId === "assistant")
        ?.text,
      "Live response",
    );

    event({
      type: "turn-completed",
      turnId: "turn",
      terminal: "completed",
      durationMs: 50,
    });
    stream.close();
    await sending;
    assert.equal(useChatStore.getState().streaming, false);
    assert.equal(
      useChatStore.getState().finishedChatIds.includes("created"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("project agent selection survives switching and invalid assignments are cleared on reload", async () => {
  const originalFetch = globalThis.fetch;
  const project = {
    id: "project",
    name: "Project",
    folder: "/tmp",
    sectionId: "default-projects",
    branch: "main",
    agentIds: ["agent-a", "agent-b"],
  };
  globalThis.fetch = async (input) =>
    String(input) === "/api/projects"
      ? Response.json([{ ...project, agentIds: ["agent-a"] }])
      : Response.json([]);

  try {
    usePreferencesStore.setState({
      ...defaultPreferences(),
      projectAgents: { project: "agent-a" },
    });
    useWorkStore.setState({ projects: [project], projectId: "", agentId: "" });
    useWorkStore.getState().selectProject("project");
    assert.equal(useWorkStore.getState().agentId, "agent-a");
    useWorkStore.getState().selectAgent("agent-b");
    useWorkStore.getState().selectProject("");
    useWorkStore.getState().selectProject("project");
    assert.equal(useWorkStore.getState().agentId, "agent-b");
    await useWorkStore.getState().load();
    assert.equal(useWorkStore.getState().agentId, "");
    await flush();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed session creation clears pending feedback and leaves a retryable draft", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ error: "Unable to start session" }, { status: 502 });

  try {
    useWorkStore.setState({ projectId: "", agentId: "" });
    useChatStore.getState().startDraft("recent");
    await useChatStore.getState().send("Retry this");
    assert.equal(useChatStore.getState().activeChatId, null);
    assert.equal(useChatStore.getState().streaming, false);
    assert.equal(useChatStore.getState().pendingRoutePush, null);
    assert.deepEqual(useChatStore.getState().items, []);
    assert.equal(useChatStore.getState().error, "Unable to start session");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("watcher completion is read for the active chat and unread for background chats", async () => {
  const originalFetch = globalThis.fetch;
  const completed = detail();
  const background = { ...completed.chat, id: "background" };
  globalThis.fetch = async () => Response.json([completed.chat, background]);

  try {
    useWorkStore.setState({ projectId: "" });
    useChatStore.setState({
      activeChatId: "created",
      chats: [
        { ...completed.chat, running: true },
        { ...background, running: true },
      ],
      finishedChatIds: [],
    });
    useChatStore.getState().syncChat(completed);
    assert.equal(
      useChatStore.getState().finishedChatIds.includes("created"),
      false,
    );
    await useChatStore.getState().loadChats();
    assert.equal(
      useChatStore.getState().finishedChatIds.includes("created"),
      false,
    );
    assert.equal(
      useChatStore.getState().finishedChatIds.includes("background"),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a measured completed snapshot resolves a stalled local stream without accepting stale idle snapshots", async () => {
  const originalFetch = globalThis.fetch;
  const created = detail();
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  globalThis.fetch = async (input) =>
    String(input).endsWith("/turns")
      ? new Response(
          new ReadableStream({
            start(controller) {
              stream = controller;
            },
          }),
        )
      : Response.json(created);

  try {
    useWorkStore.setState({ projectId: "" });
    useChatStore.setState({
      activeChatId: "created",
      items: [],
      chats: [created.chat],
      streaming: false,
    });
    const sending = useChatStore.getState().send("One more message");
    await flush();
    const event = (value: unknown) =>
      stream.enqueue(
        encoder.encode(`event: message\ndata: ${JSON.stringify(value)}\n\n`),
      );
    event({
      type: "turn-started",
      turnId: "measured",
      startedAt: Date.now() - 6000,
    });
    await flush();
    useChatStore.getState().syncChat(created);
    assert.equal(useChatStore.getState().streaming, true);
    const answer = {
      ...useChatStore.getState().items[0],
      itemId: "answer",
      kind: "agentMessage",
      status: "completed",
      turnId: "measured",
      text: "Complete",
    };
    useChatStore.getState().syncChat({
      ...created,
      items: [answer],
      turnDurations: { measured: 6000 },
    });
    assert.equal(useChatStore.getState().streaming, false);
    assert.equal(useChatStore.getState().turnDurations.measured, 6000);
    event({ type: "turn-started", turnId: "measured" });
    event({
      type: "delta",
      itemId: "answer",
      field: "text",
      delta: "duplicate",
    });
    stream.close();
    await sending;
    assert.equal(useChatStore.getState().items[0].text, "Complete");
    assert.equal(useChatStore.getState().streamingTurnId, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an older response stream cannot stop or overwrite the next message", async () => {
  const originalFetch = globalThis.fetch;
  const created = detail();
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const encoder = new TextEncoder();
  globalThis.fetch = async (input) =>
    String(input).endsWith("/turns")
      ? new Response(
          new ReadableStream({
            start(controller) {
              streams.push(controller);
            },
          }),
        )
      : Response.json([created.chat]);
  const event = (index: number, value: unknown) =>
    streams[index].enqueue(
      encoder.encode(`event: message\ndata: ${JSON.stringify(value)}\n\n`),
    );

  try {
    useWorkStore.setState({ projectId: "" });
    useChatStore.setState({
      activeChatId: "created",
      items: [],
      chats: [created.chat],
      streaming: false,
      turnDurations: {},
    });
    const first = useChatStore.getState().send("first");
    await flush();
    event(0, { type: "turn-started", turnId: "first" });
    await flush();
    const answer = {
      ...useChatStore.getState().items[0],
      itemId: "first-answer",
      kind: "agentMessage",
      status: "completed",
      turnId: "first",
      text: "first answer",
    };
    useChatStore.getState().syncChat({
      ...created,
      items: [answer],
      turnDurations: { first: 6000 },
    });
    const second = useChatStore.getState().send("second");
    await flush();
    event(1, { type: "turn-started", turnId: "second" });
    event(0, {
      type: "turn-completed",
      turnId: "first",
      terminal: "completed",
      durationMs: 6000,
    });
    streams[0].close();
    await first;
    await flush();
    assert.equal(useChatStore.getState().streaming, true);
    assert.equal(useChatStore.getState().streamingTurnId, "second");
    event(1, {
      type: "turn-completed",
      turnId: "second",
      terminal: "completed",
      durationMs: 7000,
    });
    streams[1].close();
    await second;
    assert.equal(useChatStore.getState().streaming, false);
    assert.equal(useChatStore.getState().turnDurations.second, 7000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an idle background snapshot automatically sends the queued user message once", async () => {
  const originalFetch = globalThis.fetch;
  const created = detail();
  const sent: string[] = [];
  let stream!: ReadableStreamDefaultController<Uint8Array>;

  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/turns")) {
      sent.push(JSON.parse(String(init?.body)).text);
      return new Response(
        new ReadableStream({
          start(controller) {
            stream = controller;
          },
        }),
      );
    }

    return Response.json(created);
  };

  try {
    useWorkStore.setState({ projectId: "" });
    useChatStore.setState({
      activeChatId: "created",
      chats: [created.chat],
      streaming: true,
      streamingTurnId: "background-team-turn",
      items: [],
      historyLoading: false,
      queuePaused: false,
      queuedMessages: [{ id: "queued", text: "Verify Java again", images: [] }],
    });
    useChatStore.getState().syncChat(created);
    useChatStore.getState().syncChat(created);
    await flush();

    assert.deepEqual(sent, ["Verify Java again"]);
    assert.equal(useChatStore.getState().queuedMessages.length, 0);
    stream.close();
    await flush();

    useChatStore.setState({
      streaming: false,
      queuePaused: true,
      queuedMessages: [
        { id: "paused", text: "Do not restart after stop", images: [] },
      ],
    });
    useChatStore.getState().syncChat(created);
    await flush();

    assert.deepEqual(sent, ["Verify Java again"]);
    assert.equal(useChatStore.getState().queuedMessages.length, 1);
  } finally {
    useChatStore.setState({ queuedMessages: [], queuePaused: false });
    globalThis.fetch = originalFetch;
  }
});
