import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";

const folder = mkdtempSync(join(tmpdir(), "veykor-memory-service-"));

process.env["DATABASE_URL"] = join(folder, "memory.db");

const { db } = await import("../../src/db/client.ts");
const { users, chats, projects } = await import("../../src/db/schema.ts");
const {
  MemoryFailure,
  buildMemoryContext,
  createMemory,
  deleteMemory,
  deleteProjectMemories,
  eligibleMemoryRows,
  listMemories,
  readMemory,
  saveConversationMemory,
  undoMemory,
  updateConversationMemory,
  updateMemory,
} = await import("../../src/memory/memory-service.ts");

const owner = db
  .insert(users)
  .values({ username: "memory-owner" })
  .returning()
  .get();

const stranger = db
  .insert(users)
  .values({ username: "memory-stranger" })
  .returning()
  .get();

const projectId = "project-memory";

db.insert(projects)
  .values({
    id: projectId,
    userId: owner.id,
    name: "Memory Project",
    folder: folder,
  })
  .run();

db.insert(chats)
  .values({
    id: "chat-owned",
    userId: owner.id,
    title: "Owned chat",
    projectId,
  })
  .run();

db.insert(chats)
  .values({
    id: "chat-stranger",
    userId: stranger.id,
    title: "Stranger chat",
  })
  .run();

test("manual memories stay owned and resolve project and source names", () => {
  const created = createMemory(owner.id, {
    instruction: "Always run the tests.",
    scope: "project",
    projectId,
  });

  assert.equal(created.scope, "project");
  assert.equal(created.projectId, projectId);
  assert.equal(created.projectName, "Memory Project");
  assert.equal(created.origin, "manual");
  assert.equal(created.sourceExists, false);

  assert.equal(readMemory(stranger.id, created.id), undefined);
  assert.deepEqual(listMemories(stranger.id, {}), { memories: [] });

  const listed = listMemories(owner.id, {});

  assert.equal(listed.memories.length, 1);
  assert.equal(listed.memories[0].instruction, "Always run the tests.");
});

test("conversation saves are idempotent and reuse identical teaching", () => {
  const input = {
    instruction: "Prefer tabs for indentation.",
    scope: "global" as const,
    projectId: "",
    sourceChatId: "chat-owned",
    sourceMessageId: "msg-1",
    excerpt: "Prefer tabs for indentation, please.",
    idempotencyKey: "chat-owned:turn-1:tabs",
  };

  const first = saveConversationMemory(owner.id, input);

  assert.equal(first.reused, false);
  assert.equal(first.summary.origin, "conversation");
  assert.equal(first.summary.sourceChatId, "chat-owned");
  assert.equal(first.summary.sourceChatTitle, "Owned chat");
  assert.equal(first.summary.sourceExists, true);
  assert.equal(first.receipt.scope, "global");

  const retry = saveConversationMemory(owner.id, input);

  assert.equal(retry.reused, true);
  assert.equal(retry.summary.id, first.summary.id);

  const repeated = saveConversationMemory(owner.id, {
    ...input,
    idempotencyKey: "chat-owned:turn-9:tabs",
  });

  assert.equal(repeated.reused, true);
  assert.equal(repeated.summary.id, first.summary.id);

  assert.throws(
    () =>
      saveConversationMemory(owner.id, {
        ...input,
        instruction: "My api_key: sk-abcdef1234567890",
        idempotencyKey: "chat-owned:turn-2:secret",
      }),
    (cause: unknown) => cause instanceof MemoryFailure && cause.status === 400,
  );
});

test("cross-user sources are never stored or exposed", () => {
  const saved = saveConversationMemory(owner.id, {
    instruction: "Never push on Fridays.",
    scope: "global",
    projectId: "",
    sourceChatId: "chat-stranger",
    sourceMessageId: "",
    excerpt: "",
    idempotencyKey: "chat-owned:turn-3:friday",
  });

  assert.equal(saved.summary.sourceChatId, "");
  assert.equal(saved.summary.sourceExists, false);
});

test("scope filtering keeps project memories inside their project", () => {
  createMemory(owner.id, {
    instruction: "Project-only rule.",
    scope: "project",
    projectId,
  });

  const inside = eligibleMemoryRows(owner.id, projectId);
  const outside = eligibleMemoryRows(owner.id, "");

  assert.ok(inside.some((row) => row.instruction === "Project-only rule."));
  assert.ok(inside.some((row) => row.scope === "global"));
  assert.ok(!outside.some((row) => row.instruction === "Project-only rule."));
  assert.ok(outside.every((row) => row.scope === "global"));
});

test("context selection keeps explicit globals and bounds the budget", () => {
  for (let index = 0; index < 30; index += 1) {
    createMemory(owner.id, {
      instruction: `Global preference number ${index} with padding text to consume budget.`,
      scope: "global",
    });
  }

  const context = buildMemoryContext(owner.id, projectId, "unrelated hello");

  assert.ok(context.items.length > 0);
  assert.ok(context.items.length <= 20);
  assert.ok(context.text.length <= 5000);
  assert.match(context.text, /veykor-memory-context/);
  assert.ok(
    context.items.every(
      (item) =>
        item.scope === "global" ||
        (item.scope === "project" && item.projectId === projectId),
    ),
  );

  const globalFirst = context.items.findIndex(
    (item) => item.scope === "global",
  );
  const projectFirst = context.items.findIndex(
    (item) => item.scope === "project",
  );

  if (projectFirst !== -1) {
    assert.ok(globalFirst !== -1 && globalFirst < projectFirst);
  }

  const outside = buildMemoryContext(owner.id, "", "Project-only rule");

  assert.ok(outside.items.every((item) => item.scope === "global"));
});

test("updates preserve provenance and reject stale or duplicate edits", () => {
  const created = createMemory(owner.id, {
    instruction: "Original instruction.",
    scope: "global",
  });

  const saved = saveConversationMemory(owner.id, {
    instruction: "Drafted from chat.",
    scope: "global",
    projectId: "",
    sourceChatId: "chat-owned",
    sourceMessageId: "msg-2",
    excerpt: "Drafted from chat excerpt.",
    idempotencyKey: "chat-owned:turn-4:draft",
  });

  const { summary, previous } = updateMemory(owner.id, saved.summary.id, {
    instruction: "Revised from chat.",
    expectedUpdatedAt: saved.summary.updatedAt,
  });

  assert.equal(summary.instruction, "Revised from chat.");
  assert.equal(summary.sourceChatId, "chat-owned");
  assert.equal(summary.sourceExists, true);
  assert.equal(summary.origin, "conversation");
  assert.equal(previous.instruction, "Drafted from chat.");

  assert.throws(
    () =>
      updateMemory(owner.id, saved.summary.id, {
        instruction: "Stale write.",
        expectedUpdatedAt: saved.summary.updatedAt,
      }),
    (cause: unknown) => cause instanceof MemoryFailure && cause.status === 409,
  );

  assert.throws(
    () =>
      updateMemory(owner.id, saved.summary.id, {
        instruction: created.instruction,
      }),
    (cause: unknown) => cause instanceof MemoryFailure && cause.status === 409,
  );
});

test("scope changes validate ownership and destination duplicates", () => {
  const moved = createMemory(owner.id, {
    instruction: "Move me to the project.",
    scope: "global",
  });

  assert.throws(
    () =>
      updateMemory(owner.id, moved.id, {
        scope: "project",
        projectId: "missing-project",
      }),
    (cause: unknown) => cause instanceof MemoryFailure && cause.status === 404,
  );

  const { summary } = updateMemory(owner.id, moved.id, {
    scope: "project",
    projectId,
  });

  assert.equal(summary.scope, "project");
  assert.equal(summary.projectId, projectId);
  assert.equal(summary.projectName, "Memory Project");

  createMemory(owner.id, {
    instruction: "Clash at destination.",
    scope: "global",
  });

  createMemory(owner.id, {
    instruction: "Clash at destination.",
    scope: "project",
    projectId,
  });

  const clash = listMemories(owner.id, { scope: "global" }).memories.find(
    (entry) => entry.instruction === "Clash at destination.",
  );

  assert.ok(clash);

  assert.throws(
    () =>
      updateMemory(owner.id, clash.id, {
        scope: "project",
        projectId,
      }),
    (cause: unknown) => cause instanceof MemoryFailure && cause.status === 409,
  );
});

test("undo removes only the receipt save and refuses newer edits", () => {
  const saved = saveConversationMemory(owner.id, {
    instruction: "Temporary teaching.",
    scope: "global",
    projectId: "",
    sourceChatId: "chat-owned",
    sourceMessageId: "",
    excerpt: "",
    idempotencyKey: "chat-owned:turn-5:temporary",
  });

  const undone = undoMemory(owner.id, saved.summary.id, {
    expectedUpdatedAt: saved.receipt.updatedAt,
  });

  assert.ok("deleted" in undone);
  assert.equal(readMemory(owner.id, saved.summary.id), undefined);

  const updated = updateConversationMemory(
    owner.id,
    createMemory(owner.id, {
      instruction: "Before correction.",
      scope: "global",
    }).id,
    { instruction: "After correction." },
  );

  const newer = updateMemory(owner.id, updated.summary.id, {
    instruction: "Newest edit wins.",
  });

  assert.throws(
    () =>
      undoMemory(owner.id, updated.summary.id, {
        expectedUpdatedAt: updated.receipt.updatedAt,
        previousInstruction: updated.receipt.previousInstruction,
        previousScope: updated.receipt.previousScope,
        previousProjectId: updated.receipt.previousProjectId,
      }),
    (cause: unknown) => cause instanceof MemoryFailure && cause.status === 409,
  );

  assert.equal(newer.summary.instruction, "Newest edit wins.");
});

test("project deletion removes project memories while globals survive", () => {
  const doomed = createMemory(owner.id, {
    instruction: "Doomed project rule.",
    scope: "project",
    projectId,
  });

  const survivor = saveConversationMemory(owner.id, {
    instruction: "Surviving global rule.",
    scope: "global",
    projectId: "",
    sourceChatId: "chat-owned",
    sourceMessageId: "",
    excerpt: "",
    idempotencyKey: "chat-owned:turn-6:survivor",
  });

  deleteProjectMemories(owner.id, projectId);

  assert.equal(readMemory(owner.id, doomed.id), undefined);
  assert.ok(readMemory(owner.id, survivor.summary.id));

  db.delete(chats).where(eq(chats.id, "chat-owned")).run();

  const afterDelete = listMemories(owner.id, {}).memories.find(
    (entry) => entry.id === survivor.summary.id,
  );

  assert.ok(afterDelete);
  assert.equal(afterDelete.sourceExists, false);
  assert.equal(afterDelete.sourceChatTitle, "");
});

test("deleting a memory affects subsequent context", () => {
  const created = createMemory(owner.id, {
    instruction: "Ephemeral context rule.",
    scope: "global",
  });

  const before = buildMemoryContext(owner.id, "", "Ephemeral context rule");

  assert.ok(before.items.some((item) => item.id === created.id));

  deleteMemory(owner.id, created.id);

  const after = buildMemoryContext(owner.id, "", "Ephemeral context rule");

  assert.ok(!after.items.some((item) => item.id === created.id));
});
