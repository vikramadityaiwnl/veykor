import { test } from "node:test";
import assert from "node:assert/strict";
import { responseSeconds } from "../src/chat/chat-response-timing.js";

test("response duration uses final-answer time instead of snapshot arrival or turn cleanup", () => {
  const start = Date.parse("2026-11-02T13:16:53.465Z");
  const final = Date.parse("2026-11-02T13:17:01.834Z");
  assert.equal(responseSeconds(start, final, 22), 8);
  assert.equal(responseSeconds(start, final, 77), 8);
  assert.equal(responseSeconds(start, final, 8), 8);
});

test("response duration preserves measured fallback when durable timestamps are unavailable", () => {
  assert.equal(responseSeconds(0, 0, 22), 22);
  assert.equal(responseSeconds(2000, 1000, 5), 5);
  assert.equal(responseSeconds(1000, 1100, 0), 1);
});
