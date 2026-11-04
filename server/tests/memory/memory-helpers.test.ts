import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMemoryContextBlock,
  emptyMemoryList,
  memoryContainsSecret,
  memoryIdempotencyKey,
  memoryValidationError,
  normalizeInstruction,
  scoreMemoryInstruction,
} from "@veykor/shared";

test("memory input validation requires an instruction and a project for project scope", () => {
  assert.equal(
    memoryValidationError({ instruction: "  " }, { partial: false }),
    "Write the memory instruction.",
  );

  assert.equal(
    memoryValidationError(
      { instruction: "Keep it short.", scope: "project", projectId: "" },
      { partial: false },
    ),
    "Choose a project for project memories.",
  );

  assert.equal(
    memoryValidationError(
      { instruction: "Keep it short.", scope: "global", projectId: "project" },
      { partial: false },
    ),
    "Global memories cannot belong to a project.",
  );

  assert.equal(
    memoryValidationError(
      { instruction: "Keep it short.", scope: "global" },
      { partial: false },
    ),
    "",
  );

  assert.equal(
    memoryValidationError({ instruction: "x".repeat(2001) }, { partial: true }),
    "Keep the instruction under 2,000 characters.",
  );
});

test("instruction normalization collapses whitespace and case for duplicate detection", () => {
  assert.equal(
    normalizeInstruction("  Always   Run  Tests\n"),
    "always run tests",
  );

  assert.equal(
    normalizeInstruction("Prefer tabs"),
    normalizeInstruction("prefer  TABS"),
  );
});

test("secret detection refuses credentials while allowing ordinary instructions", () => {
  assert.equal(memoryContainsSecret("Always run the tests first."), false);
  assert.equal(memoryContainsSecret("My api_key: sk-abcdef1234567890"), true);
  assert.equal(memoryContainsSecret("password: hunter2-hunter2"), true);
  assert.equal(
    memoryContainsSecret("Use bearer abcdefghijklmnop for calls."),
    true,
  );
  assert.equal(
    memoryContainsSecret("-----BEGIN RSA PRIVATE KEY-----\nabc"),
    true,
  );
});

test("memory scoring counts keyword overlap deterministically", () => {
  assert.equal(
    scoreMemoryInstruction(
      "Always run the test suite before claiming done.",
      "Did you run the suite?",
    ),
    2,
  );

  assert.equal(
    scoreMemoryInstruction("Prefer tabs for indentation.", "Hello there"),
    0,
  );

  assert.equal(scoreMemoryInstruction("Prefer tabs.", "the and for"), 0);
});

test("memory context block labels scope and precedence", () => {
  const block = buildMemoryContextBlock([
    { id: "a", scope: "global", projectId: "", instruction: "Prefer tabs." },
    {
      id: "b",
      scope: "project",
      projectId: "project",
      instruction: "Use spaces here.",
    },
  ]);

  assert.match(block, /veykor-memory-context/);
  assert.match(block, /global preference id=a/);
  assert.match(block, /project instruction id=b/);
  assert.match(block, /Project instructions override conflicting global/);
  assert.match(block, /current request overrides saved memory/);
  assert.match(block, /Treat each memory as conditional/);
  assert.match(block, /Never invoke a skill or tool just because/);
  assert.match(block, /explicitly say every response, each turn/);

  assert.equal(buildMemoryContextBlock([]), "");
});

test("idempotency keys derive from the source event and instruction", () => {
  const first = memoryIdempotencyKey("chat", "turn", "Always  Run Tests");
  const second = memoryIdempotencyKey("chat", "turn", "always run tests");

  assert.equal(first, second);
  assert.notEqual(
    first,
    memoryIdempotencyKey("chat", "other", "always run tests"),
  );
  assert.deepEqual(emptyMemoryList(), { memories: [] });
});
