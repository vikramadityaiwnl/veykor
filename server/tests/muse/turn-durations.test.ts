import assert from "node:assert/strict";
import { test } from "node:test";
import { readTurnDurations } from "../../src/muse/turn-durations.ts";

test("restores measured completed turns across history pages", async () => {
  const requested: Array<string> = [];
  const durations = await readTurnDurations(async (cursor) => {
    requested.push(cursor);

    return cursor === ""
      ? {
          events: [
            { method: "turn/started", params: { turnId: "a" } },
            {
              method: "turn/completed",
              params: { turnId: "a", durationMs: 2400 },
            },
          ],
          nextCursor: "page-two",
        }
      : {
          events: [
            {
              method: "turn/completed",
              params: { turnId: "b", durationMs: 3100 },
            },
            { method: "turn/completed", params: { turnId: "unmeasured" } },
          ],
          nextCursor: null,
        };
  });

  assert.deepEqual(requested, ["", "page-two"]);
  assert.deepEqual(durations, { a: 2400, b: 3100 });
});

test("returns empty defaults and stops repeated history cursors", async () => {
  let calls = 0;
  const durations = await readTurnDurations(async () => {
    calls += 1;

    return { events: [], nextCursor: "repeat" };
  });

  assert.deepEqual(durations, {});
  assert.equal(calls, 2);
});
