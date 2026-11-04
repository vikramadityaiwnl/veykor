import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const folder = mkdtempSync(join(tmpdir(), "veykor-questions-"));

process.env["DATABASE_URL"] = join(folder, "questions.db");

const { db } = await import("../../src/db/client.js");
const { users, chats } = await import("../../src/db/schema.js");
const {
  QuestionError,
  answerQuestionRequest,
  cancelQuestionRequest,
  createQuestionRequest,
  listQuestions,
  orphanRequest,
  pendingQuestionCount,
  settleMemberQuestions,
  settleRootQuestions,
  sweepOrphanedRequests,
  waitForSettlement,
} = await import("../../src/questions/question-store.js");

const owner = db
  .insert(users)
  .values({ username: "question-owner" })
  .returning()
  .get();

const stranger = db
  .insert(users)
  .values({ username: "question-stranger" })
  .returning()
  .get();

function makeRoot(suffix: string) {
  return db
    .insert(chats)
    .values({
      id: `root-${suffix}`,
      userId: owner.id,
      title: "Root chat",
      agentSnapshot: JSON.stringify({ id: "agent-main", name: "Main" }),
    })
    .returning()
    .get();
}

function makeMember(rootId: string, suffix: string) {
  return db
    .insert(chats)
    .values({
      id: `member-${suffix}`,
      userId: owner.id,
      title: "Teammate",
      parentChatId: rootId,
      agentSnapshot: JSON.stringify({ id: "agent-tester", name: "Tester" }),
    })
    .returning()
    .get();
}

const root = makeRoot("store");
const member = makeMember(root.id, "store");

function payload() {
  return {
    questions: [
      {
        id: "approach",
        question: "How should this behave?",
        options: [
          { id: "automatic", label: "Automatically" },
          { id: "review", label: "Review first" },
        ],
        recommendedOptionId: "review",
      },
      { id: "notes", question: "Any notes?", options: [] },
    ],
  };
}

function assertQuestionError(
  cause: unknown,
  status: number,
  message: string,
): void {
  assert.ok(cause instanceof QuestionError);
  assert.equal(cause.status, status);
  assert.equal(cause.message, message);
}

test("asking binds the request to its owner, chat, and agent", () => {
  const created = createQuestionRequest(member, payload(), "rpc-bind");

  assert.equal(created.duplicate, false);

  const record = created.record;

  assert.equal(record.rootId, root.id);
  assert.equal(record.memberId, member.id);
  assert.equal(record.agentId, "agent-tester");
  assert.equal(record.agentName, "Tester");
  assert.equal(record.isMain, false);
  assert.equal(record.status, "pending");
  assert.equal(record.questions.length, 2);
  assert.equal(record.answers.length, 0);

  assert.equal(pendingQuestionCount(member.id), 1);
  assert.equal(pendingQuestionCount(root.id), 0);

  const listed = listQuestions(owner.id, root.id);

  assert.equal(listed.pending.length, 1);
  assert.equal(listed.pending[0].id, record.id);
  assert.deepEqual(listQuestions(stranger.id, root.id), {
    pending: [],
    settled: [],
  });

  cancelQuestionRequest(owner.id, root.id, record.id, "");
});

test("duplicate delivery reuses the pending request", () => {
  const first = createQuestionRequest(root, payload(), "rpc-duplicate");
  const second = createQuestionRequest(root, payload(), "rpc-duplicate");

  assert.equal(second.duplicate, true);
  assert.equal(second.record.id, first.record.id);
  assert.equal(listQuestions(owner.id, root.id).pending.length, 1);

  cancelQuestionRequest(owner.id, root.id, first.record.id, "");
});

test("separate calls stay separate and ordered", () => {
  const first = createQuestionRequest(root, payload(), "rpc-order-1");
  const second = createQuestionRequest(member, payload(), "rpc-order-2");

  assert.notEqual(first.record.id, second.record.id);

  const listed = listQuestions(owner.id, root.id);

  assert.deepEqual(
    listed.pending.map((entry) => entry.id),
    [first.record.id, second.record.id],
  );

  const scoped = listQuestions(owner.id, root.id, member.id);

  assert.deepEqual(
    scoped.pending.map((entry) => entry.id),
    [second.record.id],
  );

  cancelQuestionRequest(owner.id, root.id, first.record.id, "");
  cancelQuestionRequest(owner.id, root.id, second.record.id, "");
});

test("pending requests are bounded per chat", () => {
  const capped = makeRoot("cap");

  for (let index = 0; index < 10; index += 1) {
    createQuestionRequest(capped, payload(), `rpc-cap-${index}`);
  }

  try {
    createQuestionRequest(capped, payload(), "rpc-cap-overflow");
    assert.fail("expected the pending cap to reject the request");
  } catch (cause) {
    assertQuestionError(
      cause,
      400,
      "Too many unanswered questions in this chat. Wait for the user to answer before asking more.",
    );
  }

  settleRootQuestions(capped.id, "cancelled", "Cleanup.");
});

test("answers route to the waiting invocation with stored labels", async () => {
  const created = createQuestionRequest(member, payload(), "rpc-route");
  const waited = waitForSettlement(created.record.id);

  const { record, alreadySettled } = answerQuestionRequest(
    owner.id,
    root.id,
    created.record.id,
    [
      { questionId: "approach", optionId: "review" },
      { questionId: "notes", customText: "Ship it Friday." },
    ],
  );

  assert.equal(alreadySettled, false);
  assert.equal(record.status, "answered");
  assert.deepEqual(record.answers, [
    {
      questionId: "approach",
      kind: "option",
      optionId: "review",
      label: "Review first",
      customText: "",
    },
    {
      questionId: "notes",
      kind: "custom",
      optionId: "",
      label: "",
      customText: "Ship it Friday.",
    },
  ]);

  const settlement = await waited;

  assert.equal(settlement.status, "answered");
  assert.deepEqual(settlement.answers, record.answers);
  assert.equal(pendingQuestionCount(member.id), 0);
});

test("submissions are idempotent and keep the first answer", () => {
  const created = createQuestionRequest(root, payload(), "rpc-idempotent");

  const first = answerQuestionRequest(owner.id, root.id, created.record.id, [
    { questionId: "approach", optionId: "automatic" },
    { questionId: "notes", customText: "First." },
  ]);

  assert.equal(first.alreadySettled, false);

  const second = answerQuestionRequest(owner.id, root.id, created.record.id, [
    { questionId: "approach", optionId: "review" },
    { questionId: "notes", customText: "Second." },
  ]);

  assert.equal(second.alreadySettled, true);
  assert.deepEqual(second.record.answers, first.record.answers);
  assert.equal(
    second.record.answers.find((entry) => entry.questionId === "notes")
      ?.customText,
    "First.",
  );
});

test("invalid answers keep the request pending and recoverable", () => {
  const created = createQuestionRequest(root, payload(), "rpc-recover");

  try {
    answerQuestionRequest(owner.id, root.id, created.record.id, [
      { questionId: "approach", optionId: "missing" },
      { questionId: "notes", customText: "Notes." },
    ]);
    assert.fail("expected the invalid option to be rejected");
  } catch (cause) {
    assertQuestionError(
      cause,
      400,
      'Option "missing" is not one of the offered choices.',
    );
  }

  const listed = listQuestions(owner.id, root.id);

  assert.ok(listed.pending.some((entry) => entry.id === created.record.id));

  const recovered = answerQuestionRequest(
    owner.id,
    root.id,
    created.record.id,
    [
      { questionId: "approach", optionId: "review" },
      { questionId: "notes", customText: "Notes." },
    ],
  );

  assert.equal(recovered.record.status, "answered");
});

test("answers and cancellations enforce ownership", () => {
  const created = createQuestionRequest(root, payload(), "rpc-owned");
  const other = makeRoot("other");

  try {
    answerQuestionRequest(stranger.id, root.id, created.record.id, []);
    assert.fail("expected a stranger answer to be rejected");
  } catch (cause) {
    assertQuestionError(cause, 404, "Question not found.");
  }

  try {
    answerQuestionRequest(owner.id, other.id, created.record.id, []);
    assert.fail("expected a wrong-chat answer to be rejected");
  } catch (cause) {
    assertQuestionError(cause, 404, "Question not found.");
  }

  try {
    cancelQuestionRequest(stranger.id, root.id, created.record.id, "");
    assert.fail("expected a stranger cancellation to be rejected");
  } catch (cause) {
    assertQuestionError(cause, 404, "Question not found.");
  }

  cancelQuestionRequest(owner.id, root.id, created.record.id, "");
});

test("cancellation informs the waiter without an answer", async () => {
  const created = createQuestionRequest(member, payload(), "rpc-cancel");
  const waited = waitForSettlement(created.record.id);

  const { record } = cancelQuestionRequest(
    owner.id,
    root.id,
    created.record.id,
    "Not now.",
  );

  assert.equal(record.status, "cancelled");
  assert.equal(record.reason, "Not now.");
  assert.deepEqual(record.answers, []);

  const settlement = await waited;

  assert.equal(settlement.status, "cancelled");
  assert.deepEqual(settlement.answers, []);
  assert.equal(settlement.reason, "Not now.");

  const repeated = cancelQuestionRequest(
    owner.id,
    root.id,
    created.record.id,
    "",
  );

  assert.equal(repeated.alreadySettled, true);
  assert.equal(repeated.record.status, "cancelled");
});

test("member settlement only touches that member", async () => {
  const sibling = makeMember(root.id, "sibling");

  const first = createQuestionRequest(member, payload(), "rpc-member-1");
  const second = createQuestionRequest(sibling, payload(), "rpc-member-2");
  const waited = waitForSettlement(first.record.id);

  const settled = settleMemberQuestions(member.id, "cancelled", "Stopped.");

  assert.deepEqual(
    settled.map((entry) => entry.id),
    [first.record.id],
  );
  assert.equal((await waited).status, "cancelled");

  const listed = listQuestions(owner.id, root.id);

  assert.ok(
    listed.pending.some((entry) => entry.id === second.record.id),
    "expected the sibling request to stay pending",
  );

  cancelQuestionRequest(owner.id, root.id, second.record.id, "");
});

test("aborted invocations orphan honestly", async () => {
  const created = createQuestionRequest(root, payload(), "rpc-abort");
  const controller = new AbortController();
  const waited = waitForSettlement(created.record.id, controller.signal);

  controller.abort();

  const settlement = await waited;

  assert.equal(settlement.status, "orphaned");

  const listed = listQuestions(owner.id, root.id);

  assert.ok(
    listed.settled.some(
      (entry) => entry.id === created.record.id && entry.status === "orphaned",
    ),
  );

  orphanRequest(created.record.id, "Repeated.");
});

test("startup sweep orphans everything still pending", async () => {
  const created = createQuestionRequest(root, payload(), "rpc-sweep");
  const waited = waitForSettlement(created.record.id);

  const swept = sweepOrphanedRequests("Restarted.");

  assert.ok(swept >= 1);
  assert.equal((await waited).status, "orphaned");
  assert.equal(listQuestions(owner.id, root.id).pending.length, 0);
});
