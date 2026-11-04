import assert from "node:assert/strict";
import { test } from "node:test";
import { composerAction } from "../src/chat/composer-mode.ts";
import { normalizeTeamTodos } from "@veykor/shared";

test("running composer switches its one action between stop and queue or steer", () => {
  assert.equal(composerAction(true, false, "queue"), "stop");
  assert.equal(composerAction(true, true, "queue"), "queue");
  assert.equal(composerAction(true, true, "steer"), "steer");
  assert.equal(composerAction(false, true, "queue"), "send");
});

test("native and team todo formats preserve progress and clearing", () => {
  assert.deepEqual(
    normalizeTeamTodos([
      { content: "Check tests", status: "inProgress" },
      { text: "Implement", status: "completed", id: "code" },
    ]),
    [
      { id: "1", text: "Check tests", status: "in_progress" },
      { id: "code", text: "Implement", status: "completed" },
    ],
  );
  assert.deepEqual(normalizeTeamTodos([]), []);
  assert.deepEqual(normalizeTeamTodos([null, {}, " "]), []);
});
