import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { ChatMessage, ChatRequest } from "@veykor/shared";

test("durable queue orders, edits, deletes, steers, pauses, recovers and isolates messages", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-queue-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: "queue-tests-with-at-least-thirty-two-bytes",
    AUTH_COOKIE_SECURE: "false",
    AUTH_ORIGINS: "http://localhost:31991",
    DATABASE_URL: join(folder, "test.db"),
    PORT: "31991",
  });
  const { db, runMigrations, closeDb } = await import("../src/db/client.js");
  const { users, sidebarSections, conversations, chatInputs } =
    await import("../src/db/schema.js");
  const { writeConversation, readConversation, metadataSession } =
    await import("../src/chat/conversations.js");
  const { chatProviderFor } = await import("../src/providers/index.js");
  const {
    submitMessage,
    queuedMessages,
    editQueuedMessage,
    deleteQueuedMessage,
    steerQueuedMessage,
    pauseQueue,
    dispatchQueue,
    stopMessageQueue,
  } = await import("../src/chat/message-queue.js");
  runMigrations();
  db.insert(users)
    .values({ id: 1, username: "queue-owner", passwordHash: "test" })
    .run();
  db.insert(users)
    .values({ id: 2, username: "other-owner", passwordHash: "test" })
    .run();
  db.insert(sidebarSections)
    .values({ id: "section", userId: 1, kind: "chats" })
    .run();
  const provider = chatProviderFor("muse")!;
  const original = { ...provider };
  const native = new Map<
    string,
    { messages: ChatMessage[]; busy: boolean; release: () => void }
  >();
  const delivered: string[] = [];
  const steered: string[] = [];
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    costAvailable: false,
  };

  function state(id: string) {
    if (!native.has(id)) {
      native.set(id, { messages: [], busy: false, release: () => {} });
    }
    return native.get(id)!;
  }

  function input(
    id: string,
    text: string,
    delivery?: "queue" | "steer",
  ): ChatRequest {
    return {
      conversationId: id,
      messageId: crypto.randomUUID(),
      providerId: "muse",
      modelId: "muse-spark-1.3",
      permissionMode: "promptUnmatched",
      reasoningEffort: "low",
      systemPrompt: "",
      messages: [{ role: "user", text }],
      ...(delivery ? { delivery } : {}),
    };
  }

  function create(id: string) {
    writeConversation(1, {
      id,
      title: id,
      projectId: null,
      sectionId: "section",
      providerId: "muse",
      modelId: "muse-spark-1.3",
      permissionMode: "promptUnmatched",
      nativeSessionId: "",
      attachments: [],
    });
  }

  function append(id: string, request: ChatRequest) {
    state(id).messages.push({
      id: request.messageId,
      submissionId: request.messageId,
      role: "user",
      text: request.messages.at(-1)!.text,
      createdAt: Date.now(),
      usage,
      tools: [],
      attachments: [],
    });
  }

  async function until(predicate: () => boolean) {
    const end = Date.now() + 3000;
    while (!predicate()) {
      assert.ok(Date.now() < end, "Queue operation timed out");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  provider.isBusy = (_userId, id) => state(id).busy;
  provider.describe = async (userId, id) => ({
    ...metadataSession(readConversation(userId, id)!),
    messages: state(id).messages,
    status: state(id).busy ? "running" : "idle",
  });
  provider.open = provider.describe;
  provider.runTurn = async (_userId, request) => {
    const live = state(request.conversationId);
    live.busy = true;
    append(request.conversationId, request);
    delivered.push(request.messages.at(-1)!.text);
    await new Promise<void>((resolve) => {
      live.release = resolve;
    });
    live.busy = false;
  };
  provider.steer = async (_userId, request) => {
    append(request.conversationId, request);
    steered.push(request.messages.at(-1)!.text);
  };

  try {
    create("ordered");
    const first = input("ordered", "first");
    await submitMessage(1, first);
    await until(() => state("ordered").busy);
    await submitMessage(1, first);
    assert.deepEqual(delivered, ["first"]);
    await submitMessage(1, input("ordered", "second"));
    await submitMessage(1, input("ordered", "delete me"));
    const pending = queuedMessages(1, "ordered");
    assert.deepEqual(
      pending.map((entry) => entry.text),
      ["second", "delete me"],
    );
    assert.throws(() => deleteQueuedMessage(2, "ordered", pending[0].id));
    assert.throws(() =>
      editQueuedMessage(2, "ordered", pending[0].id, "forged"),
    );
    editQueuedMessage(1, "ordered", pending[0].id, "edited second");
    deleteQueuedMessage(1, "ordered", pending[1].id);
    state("ordered").release();
    await until(() => delivered.length === 2);
    assert.deepEqual(delivered, ["first", "edited second"]);
    await submitMessage(1, input("ordered", "steer this"));
    await steerQueuedMessage(1, "ordered", queuedMessages(1, "ordered")[0].id);
    assert.deepEqual(steered, ["steer this"]);
    await submitMessage(1, input("ordered", "direct steer", "steer"));
    assert.deepEqual(steered, ["steer this", "direct steer"]);
    await submitMessage(1, input("ordered", "paused"));
    pauseQueue(1, "ordered", true);
    state("ordered").release();
    await until(() => !state("ordered").busy);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(delivered.length, 2);
    assert.equal(queuedMessages(1, "ordered")[0].text, "paused");
    await steerQueuedMessage(1, "ordered", queuedMessages(1, "ordered")[0].id);
    await until(() => delivered.length === 3);
    state("ordered").release();
    await until(() =>
      db
        .select()
        .from(chatInputs)
        .all()
        .every((row) => row.state === "sent"),
    );
    assert.ok(
      db
        .select()
        .from(chatInputs)
        .all()
        .every((row) => row.payload === "{}"),
    );

    await submitMessage(1, first);
    assert.equal(delivered.length, 3);
    db.update(users)
      .set({ chatDefaults: JSON.stringify({ messageBehavior: "steer" }) })
      .where(eq(users.id, 1))
      .run();
    create("preference");
    state("preference").busy = true;
    await submitMessage(1, input("preference", "saved preference steer"));
    assert.equal(steered.at(-1), "saved preference steer");
    assert.equal(queuedMessages(1, "preference").length, 0);
    state("preference").busy = false;
    db.update(users).set({ chatDefaults: "{}" }).where(eq(users.id, 1)).run();

    create("recovery");
    state("recovery").busy = true;
    await submitMessage(1, input("recovery", "already accepted"));
    await submitMessage(1, input("recovery", "after restart"));
    const saved = db
      .select()
      .from(chatInputs)
      .where(eq(chatInputs.conversationId, "recovery"))
      .all();
    db.update(chatInputs)
      .set({ state: "sending" })
      .where(eq(chatInputs.id, saved[0].id))
      .run();
    append("recovery", {
      ...JSON.parse(saved[0].payload),
      messageId: saved[0].id,
    });
    state("recovery").busy = false;
    dispatchQueue(1, "recovery");
    await until(() => delivered.includes("after restart"));
    assert.equal(delivered.includes("already accepted"), false);
    state("recovery").release();
    await until(() => !state("recovery").busy);
    db.delete(conversations).where(eq(conversations.id, "recovery")).run();
    assert.equal(
      db
        .select()
        .from(chatInputs)
        .where(eq(chatInputs.conversationId, "recovery"))
        .all().length,
      0,
    );
  } finally {
    stopMessageQueue();
    for (const live of native.values()) {
      live.release();
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    Object.assign(provider, original);
    closeDb();
    rmSync(folder, { recursive: true, force: true });
  }
});
