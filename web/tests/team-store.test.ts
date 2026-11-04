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
