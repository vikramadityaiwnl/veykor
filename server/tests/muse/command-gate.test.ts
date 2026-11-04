import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandGate } from "../../src/muse/command-gate.ts";

test("command admission stays bounded when a team starts together", async () => {
  const gate = new CommandGate(2);
  let active = 0;
  let maximum = 0;
  const admitted: number[] = [];

  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      gate.run(async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        admitted.push(index);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
      }),
    ),
  );

  assert.equal(maximum, 2);
  assert.deepEqual(
    admitted,
    Array.from({ length: 12 }, (_, index) => index),
  );
});

test("a rejected command releases admission for the next session", async () => {
  const gate = new CommandGate(1);
  const failed = gate.run(async () => {
    throw new Error("Session failed");
  });
  const next = gate.run(async () => "Ready");

  await assert.rejects(failed, /Session failed/);
  assert.equal(await next, "Ready");
});
