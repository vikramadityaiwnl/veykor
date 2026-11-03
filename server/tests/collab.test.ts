import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { ChatRequest, ChatSession } from "@veykor/shared";

const folder = mkdtempSync(join(tmpdir(), "veykor-collab-"));

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "collab-tests-with-at-least-thirty-two-bytes",
  AUTH_COOKIE_SECURE: "false",
  AUTH_ORIGINS: "http://localhost:31992",
  DATABASE_URL: join(folder, "test.db"),
  PORT: "31992",
});

const { db, runMigrations, closeDb } = await import("../src/db/client.js");
const schema = await import("../src/db/schema.js");
const conversations = await import("../src/chat/conversations.js");
const { createAgent } = await import("../src/agents/store.js");
const { chatProviderFor } = await import("../src/providers/index.js");
const store = await import("../src/collab/store.js");
const sessions = await import("../src/collab/sessions.js");
const events = await import("../src/collab/events.js");
const tasks = await import("../src/collab/tasks.js");
const interruption = await import("../src/collab/interruption.js");
const stopCommands = await import("../src/collab/stop-commands.js");
const sweeper = await import("../src/collab/sweeper.js");
const human = await import("../src/collab/human.js");
const dispatch = await import("../src/chat/collab-dispatch.js");

runMigrations();

db.insert(schema.users)
  .values({ id: 1, username: "collab-owner", passwordHash: "test" })
  .run();
db.insert(schema.users)
  .values({ id: 2, username: "collab-other", passwordHash: "test" })
  .run();
db.insert(schema.sidebarSections)
  .values({ id: "section", userId: 1, kind: "chats" })
  .run();
db.insert(schema.projects)
  .values({
    id: "proj",
    userId: 1,
    name: "P",
    folder: folder,
    sectionId: "section",
  })
  .run();

const modelId = "muse-spark-1.3";
const stubCatalog = {
  available: true,
  error: "",
  models: [
    {
      id: modelId,
      reasoningEfforts: [{ tier: "max" }, { tier: "high" }],
      defaultReasoningEffort: "max",
    },
  ],
};

async function delegate(
  input: Omit<Parameters<typeof tasks.delegateTask>[0], "catalog">,
) {
  return tasks.delegateTask({ ...input, catalog: stubCatalog });
}

const provider = chatProviderFor("muse")!;
const native = new Map<string, { busy: boolean; approvals: number }>();

provider.isBusy = (_userId, id) => native.get(id)?.busy === true;
provider.describe = async (_userId, id) => {
  const metadata = conversations.readConversation(_userId, id);
  if (!metadata) {
    return undefined;
  }
  const state = native.get(id) || { busy: false, approvals: 0 };
  return {
    ...conversations.metadataSession(metadata),
    status: state.busy ? "running" : "idle",
    error: "",
    approvals:
      state.approvals > 0
        ? [
            {
              id: `approval-${id}`,
              toolName: "shell",
              arguments: "ls",
              choices: [
                {
                  choiceId: "once",
                  label: "Allow",
                  scope: "once",
                  rulePreview: "",
                },
              ],
            },
          ]
        : [],
    messages: [],
  } as ChatSession;
};
provider.stop = async (_userId, id) => {
  const state = native.get(id) || { busy: false, approvals: 0 };
  state.busy = false;
  native.set(id, state);
};

function makeParent(id: string, userId = 1): string {
  conversations.writeConversation(userId, {
    id,
    title: `Main ${id}`,
    projectId: "proj",
    sectionId: null,
    providerId: "muse",
    modelId,
    reasoningEffort: "max",
    nativeSessionId: `native-${id}`,
    permissionMode: "promptUnmatched",
    agentId: null,
    agentName: "Lead",
    agentSnapshot: null,
    attachments: [],
    turnTimings: {},
  });
  return id;
}

function makeAgent(name: string) {
  return createAgent(1, {
    name,
    description: `${name} agent`,
    instructions: `You are ${name}`,
    providerId: "muse",
    modelId,
    reasoningEffort: "",
    permissionMode: "promptUnmatched",
    projectIds: ["proj"],
    toolsMode: "unrestricted",
    allowedTools: [],
    skillsMode: "unrestricted",
    skillIds: [],
    mcpMode: "unrestricted",
    mcpServerIds: [],
  });
}

const tester = makeAgent("Tester");
const researcher = makeAgent("Researcher");

function chatRowCount(userId: number, conversationId: string): number {
  return db
    .select()
    .from(schema.chatInputs)
    .where(
      and(
        eq(schema.chatInputs.userId, userId),
        eq(schema.chatInputs.conversationId, conversationId),
      ),
    )
    .all().length;
}

test("delegation creates one internal session per agent and hides it from ordinary lists", async () => {
  const parent = makeParent("parent-1");

  const first = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Write tests",
    instructions: "Write unit tests",
  });

  assert.equal(first.task.state, "queued");
  assert.equal(first.reusedSession, false);

  const second = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Write more tests",
    instructions: "Write more unit tests",
  });

  assert.equal(second.reusedSession, true);
  assert.equal(second.task.conversationId, first.task.conversationId);
  assert.notEqual(second.task.id, first.task.id);

  const otherParent = makeParent("parent-2");
  const other = await delegate({
    userId: 1,
    parentConversationId: otherParent,
    callerConversationId: otherParent,
    agentId: tester.id,
    title: "Other chat task",
    instructions: "Do it",
  });

  assert.notEqual(other.task.conversationId, first.task.conversationId);

  const ordinary = conversations.listOrdinaryConversations(1);
  assert.ok(ordinary.some((entry) => entry.id === parent));
  assert.ok(!ordinary.some((entry) => entry.id === first.task.conversationId));

  const internal = conversations.listInternalConversations(1, parent);
  assert.equal(internal.length, 1);
  assert.equal(internal[0].agentSnapshot?.name, "Tester");
});

test("only the lead delegates; delegates cannot spawn", async () => {
  const parent = makeParent("parent-lead-only");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Task",
    instructions: "Do it",
  });

  await assert.rejects(
    delegate({
      userId: 1,
      parentConversationId: parent,
      callerConversationId: task.conversationId,
      agentId: researcher.id,
      title: "Nested",
      instructions: "Nope",
    }),
    /Only the lead/,
  );
});

test("event fan-out is ordered, skips the source, and avoids duplicates", async () => {
  const parent = makeParent("parent-events");

  await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Task",
    instructions: "Do it",
  });
  await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: researcher.id,
    title: "Research",
    instructions: "Look it up",
  });

  const parts = store.listParticipants(1, parent);
  const lead = parts.find((entry) => entry.role === "lead")!;
  const testerPart = parts.find((entry) => entry.agentName === "Tester")!;

  const ordered = store.listEvents(1, parent).map((entry) => entry.seq);
  assert.deepEqual(
    ordered,
    [...ordered].sort((a, b) => a - b),
  );

  const first = events.publishEvent({
    userId: 1,
    parentConversationId: parent,
    type: "progress-reported",
    sourceKind: "agent",
    sourceConversationId: testerPart.conversationId,
    sourceName: "Tester",
    participantId: testerPart.id,
    participantName: "Tester",
    correlationId: "progress-1",
    title: "Tester reported progress",
    body: "half done",
  });
  const duplicate = events.publishEvent({
    userId: 1,
    parentConversationId: parent,
    type: "progress-reported",
    sourceKind: "agent",
    sourceConversationId: testerPart.conversationId,
    sourceName: "Tester",
    participantId: testerPart.id,
    participantName: "Tester",
    correlationId: "progress-1",
    title: "Tester reported progress",
    body: "half done",
  });

  assert.equal(first.id, duplicate.id);

  const testerPending = events.pendingEvents(1, testerPart.conversationId);
  assert.ok(!testerPending.some((entry) => entry.id === first.id));

  const leadPending = events.pendingEvents(1, lead.conversationId);
  assert.ok(leadPending.some((entry) => entry.id === first.id));

  const digest = events.buildDigest(1, parent, lead.conversationId);
  assert.ok(digest.text.includes("collaboration update"));
  assert.ok(digest.eventIds.length > 0);

  events.consumeDeliveries(
    1,
    parent,
    lead.conversationId,
    digest.eventIds,
    digest.maxSeq,
  );

  const remaining = events.pendingEvents(1, lead.conversationId);
  assert.ok(
    !digest.eventIds.some((id) => remaining.some((entry) => entry.id === id)),
  );
});

test("stop commands resolve exactly and leave negations alone", () => {
  const testerTarget = { conversationId: "conv-tester", agentName: "Tester" };
  const researcherTarget = {
    conversationId: "conv-researcher",
    agentName: "Researcher",
  };

  assert.deepEqual(
    stopCommands.parseDelegateStopCommand("stop", testerTarget, [
      researcherTarget,
    ]),
    { action: "stop", conversationId: "conv-tester", agentName: "Tester" },
  );
  assert.deepEqual(
    stopCommands.parseDelegateStopCommand("stop testing", testerTarget, [
      researcherTarget,
    ]),
    { action: "stop", conversationId: "conv-tester", agentName: "Tester" },
  );
  assert.deepEqual(
    stopCommands.parseDelegateStopCommand(
      "don’t stop Tester until finished",
      testerTarget,
      [researcherTarget],
    ),
    { action: "message" },
  );
  assert.deepEqual(
    stopCommands.parseDelegateStopCommand("stop Researcher", testerTarget, [
      researcherTarget,
    ]),
    { action: "message" },
  );
  assert.deepEqual(
    stopCommands.parseMainStopCommand("stop Tester", [
      testerTarget,
      researcherTarget,
    ]),
    { action: "stop", conversationId: "conv-tester", agentName: "Tester" },
  );
  assert.deepEqual(
    stopCommands.parseMainStopCommand("don’t stop Tester until finished", [
      testerTarget,
    ]),
    { action: "message" },
  );

  const ambiguous = stopCommands.parseMainStopCommand("stop", [
    testerTarget,
    researcherTarget,
  ]);
  assert.equal(ambiguous.action, "ask");
  assert.deepEqual((ambiguous as { candidates: string[] }).candidates, [
    "Tester",
    "Researcher",
  ]);

  assert.deepEqual(
    stopCommands.parseMainStopCommand("please stop Tester now", [testerTarget]),
    { action: "message" },
  );
});

test("queued interruption confirms immediately and is idempotent", async () => {
  const parent = makeParent("parent-stop-queued");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Queued work",
    instructions: "Do it",
  });

  const first = await interruption.requestInterruption({
    userId: 1,
    taskId: task.id,
    instructionText: "stop Tester",
    sourceKind: "human",
    sourceConversationId: parent,
    sourceName: "You",
  });

  assert.equal(first.task.state, "interrupted");
  assert.equal(first.task.interruptState, "confirmed");
  assert.equal(first.alreadyTerminal, false);

  const second = await interruption.requestInterruption({
    userId: 1,
    taskId: task.id,
    sourceKind: "human",
    sourceConversationId: parent,
    sourceName: "You",
  });

  assert.equal(second.alreadyTerminal, true);

  const types = store.listEvents(1, parent).map((entry) => entry.type);
  assert.ok(types.includes("interruption-requested"));
  assert.ok(types.includes("interruption-confirmed"));

  await sweeper.dispatchReadyTasks(1, parent);
  assert.equal(chatRowCount(1, task.conversationId), 0);
});

test("running interruption requests provider stop and confirms without restarting", async () => {
  const parent = makeParent("parent-stop-running");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Running work",
    instructions: "Do it",
  });

  await sweeper.dispatchReadyTasks(1, parent);
  assert.equal(chatRowCount(1, task.conversationId), 1);

  native.set(task.conversationId, { busy: true, approvals: 0 });

  const other = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: researcher.id,
    title: "Other work",
    instructions: "Keep going",
  });

  const requested = await interruption.requestInterruption({
    userId: 1,
    taskId: task.id,
    sourceKind: "human",
    sourceConversationId: parent,
    sourceName: "You",
  });

  assert.equal(requested.task.interruptState, "confirmed");
  assert.equal(requested.task.state, "interrupted");

  const otherPending = events.pendingEvents(1, other.task.conversationId);
  assert.ok(
    otherPending.some((entry) => entry.type === "interruption-confirmed"),
  );

  await sweeper.dispatchReadyTasks(1, parent);
  assert.equal(chatRowCount(1, task.conversationId), 0);

  const leadPending = events.pendingEvents(1, parent);
  assert.ok(
    leadPending.some((entry) => entry.type === "interruption-confirmed"),
  );
});

test("results complete tasks and wake the lead exactly once", async () => {
  const parent = makeParent("parent-result");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Report work",
    instructions: "Do it",
  });

  await sweeper.dispatchReadyTasks(1, parent);
  store.updateTask(1, task.id, { state: "running" });

  const completed = tasks.reportResult({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: task.conversationId,
    callerName: "Tester",
    taskId: task.id,
    result: "All green",
  });

  assert.equal(completed.state, "completed");

  await assert.rejects(
    (async () =>
      tasks.reportResult({
        userId: 1,
        parentConversationId: parent,
        callerConversationId: task.conversationId,
        callerName: "Tester",
        taskId: task.id,
        result: "again",
      }))(),
    /already completed/,
  );

  const firstWake = chatRowCount(1, parent);
  assert.equal(firstWake, 1);

  sweeper.sweepWakes(1, parent);
  assert.equal(chatRowCount(1, parent), 1);
});

test("clarification pauses the delegate and answers resume it", async () => {
  const parent = makeParent("parent-clarify");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Unclear work",
    instructions: "Do it",
  });

  store.updateTask(1, task.id, { state: "running" });

  tasks.sendCollabMessage({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: task.conversationId,
    callerName: "Tester",
    callerKind: "agent",
    to: "lead",
    kind: "question",
    text: "Which version?",
    taskId: task.id,
  });

  assert.equal(store.readTask(1, task.id)?.state, "waiting-for-reply");

  tasks.sendCollabMessage({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    callerName: "Lead",
    callerKind: "agent",
    to: "Tester",
    kind: "answer",
    text: "Version two",
    taskId: task.id,
  });

  assert.equal(store.readTask(1, task.id)?.state, "running");
  assert.ok(chatRowCount(1, task.conversationId) >= 1);
});

test("human instructions reach the delegate and flip waiting tasks", async () => {
  const parent = makeParent("parent-human");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Guided work",
    instructions: "Do it",
  });

  store.updateTask(1, task.id, { state: "waiting-for-reply" });

  human.recordDelegateInstruction({
    userId: 1,
    delegateConversationId: task.conversationId,
    text: "Use the new API",
    attachments: [],
  });

  assert.equal(store.readTask(1, task.id)?.state, "running");

  const leadPending = events.pendingEvents(1, parent);
  assert.ok(leadPending.some((entry) => entry.type === "human-instruction"));

  const delegatePending = events.pendingEvents(1, task.conversationId);
  assert.ok(
    !delegatePending.some((entry) => entry.type === "human-instruction"),
  );
});

test("dependent tasks wait, start after success, and block on failure", async () => {
  const parent = makeParent("parent-deps");

  const first = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "First",
    instructions: "Do first",
  });

  const second = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: researcher.id,
    title: "Second",
    instructions: "Do second",
    dependsOn: [first.task.id],
  });

  await sweeper.dispatchReadyTasks(1, parent);
  assert.equal(chatRowCount(1, second.task.conversationId), 0);
  assert.ok(tasks.waitingLabel(1, second.task).includes("Tester"));

  tasks.transitionTask(1, first.task.id, {
    state: "completed",
    result: "done",
    resultPreview: "done",
  });
  await sweeper.dispatchReadyTasks(1, parent);
  assert.equal(chatRowCount(1, second.task.conversationId), 1);

  const third = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Third",
    instructions: "Do third",
    dependsOn: [second.task.id],
  });

  tasks.transitionTask(1, second.task.id, { state: "failed", error: "boom" });

  const blocked = store.readTask(1, third.task.id);
  assert.equal(blocked?.state, "blocked");
  assert.ok(blocked?.blockedBy.includes("Researcher"));
});

test("delegation events never wake a delegate directly", async () => {
  const parent = makeParent("parent-no-delegate-wake");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Quiet task",
    instructions: "Do it",
  });

  assert.equal(
    tasks.wakeSession(1, parent, task.conversationId, "Continue."),
    false,
  );
  assert.equal(chatRowCount(1, task.conversationId), 0);
});

test("uncertain queue errors keep the task running with an honest event", async () => {
  const parent = makeParent("parent-uncertain");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Uncertain work",
    instructions: "Do it",
  });

  await sweeper.dispatchReadyTasks(1, parent);
  store.updateTask(1, task.id, { state: "running" });

  const hooks = await import("../src/collab/turn-hooks.js");
  const row = db
    .select()
    .from(schema.chatInputs)
    .where(
      and(
        eq(schema.chatInputs.userId, 1),
        eq(schema.chatInputs.conversationId, task.conversationId),
      ),
    )
    .get()!;

  db.update(schema.chatInputs)
    .set({ state: "error", error: "shutdown", errorKind: "uncertain" })
    .where(eq(schema.chatInputs.id, row.id))
    .run();

  hooks.onQueueRowError(row.id);

  assert.equal(store.readTask(1, task.id)?.state, "running");
  assert.ok(
    store
      .listEvents(1, parent)
      .some((entry) => entry.title.includes("uncertain")),
  );
});

test("dispatch is idempotent across restarts and scoped by account", async () => {
  const parent = makeParent("parent-restart");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Once",
    instructions: "Do it",
  });

  await sweeper.dispatchReadyTasks(1, parent);
  await sweeper.dispatchReadyTasks(1, parent);
  assert.equal(chatRowCount(1, task.conversationId), 1);

  assert.equal(store.readTask(2, task.id), undefined);
  assert.deepEqual(store.listParticipants(2, parent), []);

  const foreign = sessions.parentOf(2, task.conversationId);
  assert.equal(foreign, undefined);
});

test("approval polling tracks waiting state without duplicating events", async () => {
  const parent = makeParent("parent-approval");

  const { task } = await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Needs approval",
    instructions: "Do it",
  });

  store.updateTask(1, task.id, { state: "running" });
  native.set(task.conversationId, { busy: true, approvals: 1 });

  await sweeper.pollDelegateApprovals(1, parent);
  await sweeper.pollDelegateApprovals(1, parent);

  assert.equal(store.readTask(1, task.id)?.state, "waiting-for-approval");

  const needed = store
    .listEvents(1, parent)
    .filter((entry) => entry.type === "approval-needed");
  assert.equal(needed.length, 1);

  native.set(task.conversationId, { busy: false, approvals: 0 });
  await sweeper.pollDelegateApprovals(1, parent);
  assert.equal(store.readTask(1, task.id)?.state, "running");
});

test("enqueue dedupes wake rows and digest attach preserves ordering", async () => {
  const parent = makeParent("parent-digest");

  await delegate({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: parent,
    agentId: tester.id,
    title: "Task",
    instructions: "Do it",
  });

  const lead = store
    .listParticipants(1, parent)
    .find((entry) => entry.role === "lead")!;

  const first = dispatch.enqueueCollabTurn({
    userId: 1,
    conversationId: parent,
    clientMessageId: "collab-wake:test",
    text: "wake",
  });
  const second = dispatch.enqueueCollabTurn({
    userId: 1,
    conversationId: parent,
    clientMessageId: "collab-wake:test",
    text: "wake",
  });

  assert.equal(first, true);
  assert.equal(second, false);

  const delegated = store.listTasks(1, parent)[0];

  store.updateTask(1, delegated.id, { state: "running" });
  tasks.reportResult({
    userId: 1,
    parentConversationId: parent,
    callerConversationId: delegated.conversationId,
    callerName: "Tester",
    taskId: delegated.id,
    result: "findings",
  });

  const input: ChatRequest = {
    conversationId: parent,
    messageId: "m1",
    providerId: "muse",
    modelId,
    permissionMode: "promptUnmatched",
    reasoningEffort: "max",
    systemPrompt: "",
    messages: [{ role: "user", text: "hello" }],
  };

  const attached = dispatch.attachCollabDigest(1, input);
  assert.ok(attached.input.messages[0].text.includes("collaboration update"));
  assert.ok(attached.input.messages[0].text.endsWith("hello"));

  dispatch.confirmCollabDigest(1, attached, parent);
  assert.equal(events.pendingCount(1, lead.conversationId), 0);
});

after(() => {
  closeDb();
  rmSync(folder, { recursive: true, force: true });
});
