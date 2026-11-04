import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatDetail } from "@veykor/shared";
import { reconcileMemberSnapshot } from "../src/teams/member-snapshot.ts";

function detail(turnId: string): ChatDetail {
  return {
    activeTurnId: turnId,
    activeTurnStartedAt: 1,
    running: true,
    turnDurations: {},
    chat: {
      id: "tester",
      title: "",
      sectionId: "",
      projectId: "",
      agentId: "",
      agentName: "",
      museSessionId: "",
      running: true,
      createdAt: "",
      updatedAt: "",
    },
    items: [],
    pendingApprovals: [],
    pendingQuestions: [],
    recentQuestions: [],
    generatedImages: [],
    modelId: "",
    providerId: "",
    reasoningEffort: "",
    permission: "read-only",
  };
}

test("late running snapshots cannot revive a completed teammate turn", () => {
  const completed = {
    ...detail("finished"),
    running: false,
    turnDurations: { finished: 100 },
  };
  const stale = reconcileMemberSnapshot(completed, detail("finished"));
  assert.equal(stale.running, false);
  assert.equal(stale.activeTurnId, "");
  assert.equal(stale.activeTurnStartedAt, 0);
  const next = reconcileMemberSnapshot(completed, detail("new-turn"));
  assert.equal(next.running, true);
  assert.equal(next.activeTurnId, "new-turn");
});
