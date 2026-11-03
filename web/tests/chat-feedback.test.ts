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
