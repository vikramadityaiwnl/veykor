import assert from "node:assert/strict";
import { test } from "node:test";
import type { TeamSnapshot } from "@veykor/shared";
import { useTeamStore } from "../src/teams/team-store.ts";

function snapshot(rootId: string, name: string): TeamSnapshot {
  return {
    rootId,
    members: [
      {
        id: name,
        agentId: "",
        name,
        task: "",
        status: "idle",
        error: "",
        isMain: true,
        todos: [],
        queuedMessages: [],
        pendingQuestions: 0,
      },
    ],
    events: [],
    availableAgents: [],
  };
}

test("late team responses cannot replace the latest visit to the same chat", async () => {
  const originalFetch = globalThis.fetch;
  const requests: ((response: Response) => void)[] = [];
  const cleanups: (() => void)[] = [];

  globalThis.fetch = () =>
    new Promise((resolve) => {
      requests.push(resolve);
    });

  try {
    cleanups.push(useTeamStore.getState().watch("first"));
    cleanups[0]();
    cleanups.push(useTeamStore.getState().watch("second"));
    cleanups[1]();
    cleanups.push(useTeamStore.getState().watch("first"));

    requests[2](Response.json(snapshot("first", "Current team")));
    await new Promise((resolve) => setImmediate(resolve));
    requests[0](Response.json(snapshot("first", "Old team")));
    requests[1](Response.json(snapshot("second", "Other team")));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(useTeamStore.getState().rootId, "first");
    assert.equal(
      useTeamStore.getState().snapshot.members[0].name,
      "Current team",
    );
  } finally {
    cleanups.forEach((cleanup) => cleanup());
    globalThis.fetch = originalFetch;
  }
});

test("a member waiting on a question opens its panel tab", async () => {
  const originalFetch = globalThis.fetch;
  const team = snapshot("waiting", "Main");
  team.members.push({
    id: "tester",
    agentId: "agent-tester",
    name: "Tester",
    task: "Test things",
    status: "running",
    error: "",
    isMain: false,
    todos: [],
    queuedMessages: [],
    pendingQuestions: 1,
  });
  globalThis.fetch = async () => Response.json(team);
  let cleanup = () => {};

  try {
    useTeamStore.setState({ tabs: [], selectedId: "" });
    cleanup = useTeamStore.getState().watch("waiting");
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(useTeamStore.getState().tabs, ["tester"]);
    assert.equal(useTeamStore.getState().selectedId, "tester");

    team.members[1].pendingQuestions = 0;
    await useTeamStore.getState().refresh();

    assert.deepEqual(useTeamStore.getState().tabs, ["tester"]);
    assert.equal(useTeamStore.getState().selectedId, "tester");
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("selecting the main conversation preserves open member tabs", () => {
  useTeamStore.setState({ tabs: [], selectedId: "" });
  useTeamStore.getState().select("planner");
  useTeamStore.getState().select("tester");
  useTeamStore.getState().select("");

  assert.deepEqual(useTeamStore.getState().tabs, ["planner", "tester"]);
  assert.equal(useTeamStore.getState().selectedId, "");

  useTeamStore.getState().select("planner");
  useTeamStore.getState().close("planner");

  assert.equal(useTeamStore.getState().selectedId, "tester");
  assert.deepEqual(useTeamStore.getState().tabs, ["tester"]);
});

test("team tabs restore per chat and discard deleted members", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  const team = snapshot("persist", "tester");
  team.members[0].isMain = false;
  globalThis.fetch = async () => Response.json(team);
  let cleanup = () => {};

  try {
    cleanup = useTeamStore.getState().watch("persist");
    await new Promise((resolve) => setImmediate(resolve));
    useTeamStore.getState().select("tester");
    cleanup();
    cleanup = useTeamStore.getState().watch("elsewhere");
    assert.equal(useTeamStore.getState().selectedId, "");
    cleanup();
    cleanup = useTeamStore.getState().watch("persist");
    assert.equal(useTeamStore.getState().selectedId, "tester");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(useTeamStore.getState().tabs, ["tester"]);
    team.members = [];
    await useTeamStore.getState().refresh();
    assert.equal(useTeamStore.getState().selectedId, "");
    assert.deepEqual(useTeamStore.getState().tabs, []);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    if (originalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalStorage);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});
