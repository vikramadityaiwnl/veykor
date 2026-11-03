import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { ChatRequest } from "@veykor/shared";

const folder = mkdtempSync(join(tmpdir(), "veykor-reliability-"));
const origin = "http://localhost:31993";
Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "reliability-tests-with-at-least-thirty-two-bytes",
  AUTH_COOKIE_SECURE: "false",
  AUTH_ORIGINS: origin,
  DATABASE_URL: join(folder, "test.db"),
  PORT: "31993",
});

const { db, runMigrations, closeDb } = await import("../src/db/client.js");
const { users, sidebarSections, chatInputs } =
  await import("../src/db/schema.js");
const { writeConversation, readConversation, metadataSession } =
  await import("../src/chat/conversations.js");
const { chatProviderFor, providerRegistration } =
  await import("../src/providers/index.js");
const {
  submitMessage,
  queuedMessages,
  editQueuedMessage,
  deleteQueuedMessage,
  steerQueuedMessage,
  dispatchQueue,
  stopMessageQueue,
} = await import("../src/chat/message-queue.js");
const {
  LiveSnapshotTracker,
  formatLiveCursor,
  parseLiveCursor,
  isNewerLiveCursor,
} = await import("../src/chat/live-cursor.js");
const { model } = await import("../src/providers/muse/models.js");

runMigrations();
db.insert(users)
  .values({ id: 1, username: "reliability-owner", passwordHash: "test" })
  .run();
db.insert(sidebarSections)
  .values({ id: "section", userId: 1, kind: "chats" })
  .run();

const provider = chatProviderFor("muse")!;
const originalProvider = { ...provider };
const usage = {
  inputTokens: 0,
  outputTokens: 0,
  cost: 0,
  costAvailable: false,
};

interface FakeState {
  messages: {
    id: string;
    submissionId: string;
    role: "user";
    text: string;
    createdAt: number;
    usage: typeof usage;
    tools: never[];
    attachments: never[];
  }[];
  busy: boolean;
  release: () => void;
  deliveries: ChatRequest[];
  attempts: number;
  fail: boolean;
  block: boolean;
}

const states = new Map<string, FakeState>();

function fakeState(id: string): FakeState {
  if (!states.has(id)) {
    states.set(id, {
      messages: [],
      busy: false,
      release: () => {},
      deliveries: [],
      attempts: 0,
      fail: false,
      block: false,
    });
  }
  return states.get(id)!;
}

function createConversation(id: string) {
  writeConversation(1, {
    id,
    title: id,
    projectId: null,
    sectionId: "section",
    providerId: "muse",
    modelId: "muse-spark-1.3",
    reasoningEffort: "",
    permissionMode: "promptUnmatched",
    nativeSessionId: "",
    attachments: [],
  });
}

function input(
  id: string,
  text: string,
  overrides: Partial<ChatRequest> = {},
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
    ...overrides,
  };
}

async function until(predicate: () => boolean) {
  const end = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < end, "Queue operation timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

provider.isBusy = (_userId, id) => fakeState(id).busy;
provider.describe = async (userId, id) => ({
  ...metadataSession(readConversation(userId, id)!),
  messages: fakeState(id).messages,
  status: fakeState(id).busy ? "running" : "idle",
});
provider.open = provider.describe;
provider.runTurn = async (_userId, request) => {
  const state = fakeState(request.conversationId);
  state.attempts += 1;
  if (state.fail) {
    throw new Error("Muse CLI is disconnected");
  }
  state.busy = true;
  state.messages.push({
    id: request.messageId,
    submissionId: request.messageId,
    role: "user",
    text: request.messages.at(-1)!.text,
    createdAt: Date.now(),
    usage,
    tools: [],
    attachments: [],
  });
  state.deliveries.push(request);
  if (state.block) {
    await new Promise<void>((resolve) => {
      state.release = resolve;
    });
  }
  state.busy = false;
};
provider.steer = async (_userId, request) => {
  const state = fakeState(request.conversationId);
  state.messages.push({
    id: request.messageId,
    submissionId: request.messageId,
    role: "user",
    text: request.messages.at(-1)!.text,
    createdAt: Date.now(),
    usage,
    tools: [],
    attachments: [],
  });
  state.deliveries.push(request);
};

test("live cursors are stable, monotonic and reset across backend boots", () => {
  const tracker = new LiveSnapshotTracker();
  const first = tracker.cursorFor(1, "a");
  assert.equal(tracker.cursorFor(1, "a"), first);
  const second = tracker.cursorFor(1, "b");
  assert.notEqual(second, first);
  assert.ok(
    isNewerLiveCursor(parseLiveCursor(first), parseLiveCursor(second)!),
  );
  assert.equal(
    isNewerLiveCursor(parseLiveCursor(second), parseLiveCursor(first)!),
    false,
  );
  assert.equal(
    isNewerLiveCursor(parseLiveCursor(second), parseLiveCursor(second)!),
    false,
  );
  assert.ok(
    isNewerLiveCursor(parseLiveCursor(second), { bootId: "new-boot", seq: 0 }),
  );
  assert.equal(formatLiveCursor({ bootId: "boot", seq: 3 }), "boot:3");
  assert.equal(parseLiveCursor("not-a-cursor"), undefined);
  assert.equal(parseLiveCursor(""), undefined);
});

test("queued messages keep captured settings and duplicates deliver once", async () => {
  createConversation("capture");
  const state = fakeState("capture");
  state.block = true;
  const first = input("capture", "first", { reasoningEffort: "low" });
  await submitMessage(1, first);
  await until(() => state.busy);
  await submitMessage(1, first);
  const second = input("capture", "second", {
    modelId: "muse-spark-1.2",
    reasoningEffort: "high",
    permissionMode: "allowAll",
  });
  await submitMessage(1, second);
  assert.deepEqual(
    queuedMessages(1, "capture").map((entry) => entry.text),
    ["second"],
  );
  const saved = readConversation(1, "capture")!;
  assert.equal(saved.modelId, "muse-spark-1.2");
  assert.equal(saved.reasoningEffort, "high");
  assert.equal(saved.permissionMode, "allowAll");
  writeConversation(1, { ...saved, reasoningEffort: "max" });
  state.block = false;
  state.release();
  await until(() => state.deliveries.length === 2);
  assert.deepEqual(
    state.deliveries.map((entry) => entry.messages.at(-1)!.text),
    ["first", "second"],
  );
  assert.equal(state.deliveries[0].reasoningEffort, "low");
  assert.equal(state.deliveries[1].reasoningEffort, "high");
  assert.equal(state.deliveries[1].modelId, "muse-spark-1.2");
  assert.equal(state.deliveries[1].permissionMode, "allowAll");
  await until(
    () =>
      db
        .select()
        .from(chatInputs)
        .where(eq(chatInputs.conversationId, "capture"))
        .all()
        .filter((row) => row.state !== "sent").length === 0,
  );
});

test("uncertain queue failures stay visible and editable without automatic resend", async () => {
  createConversation("flaky");
  const state = fakeState("flaky");
  state.fail = true;
  await submitMessage(1, input("flaky", "keep this text"));
  await until(() => queuedMessages(1, "flaky")[0]?.state === "error");
  const failed = queuedMessages(1, "flaky")[0];
  assert.equal(failed.errorKind, "uncertain");
  assert.equal(failed.text, "keep this text");
  assert.equal(readConversation(1, "flaky")!.queuePaused, true);
  assert.equal(state.attempts, 1);
  dispatchQueue(1, "flaky");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(state.attempts, 1);
  editQueuedMessage(1, "flaky", failed.id, "edited after failure");
  const edited = queuedMessages(1, "flaky")[0];
  assert.equal(edited.state, "queued");
  assert.equal(edited.errorKind, "");
  state.fail = false;
  await steerQueuedMessage(1, "flaky", failed.id);
  await until(() => queuedMessages(1, "flaky").length === 0);
  assert.deepEqual(
    state.deliveries.map((entry) => entry.messages.at(-1)!.text),
    ["edited after failure"],
  );
});

test("sending rows reconcile against the provider after a restart", async () => {
  createConversation("recovered-accepted");
  const accepted = fakeState("recovered-accepted");
  accepted.busy = true;
  const acceptedInput = input("recovered-accepted", "already accepted");
  await submitMessage(1, acceptedInput);
  const acceptedRow = db
    .select()
    .from(chatInputs)
    .where(eq(chatInputs.conversationId, "recovered-accepted"))
    .get()!;
  db.update(chatInputs)
    .set({ state: "sending" })
    .where(eq(chatInputs.id, acceptedRow.id))
    .run();
  accepted.messages.push({
    id: acceptedRow.id,
    submissionId: acceptedRow.id,
    role: "user",
    text: "already accepted",
    createdAt: Date.now(),
    usage,
    tools: [],
    attachments: [],
  });
  accepted.busy = false;
  await new Promise((resolve) => setTimeout(resolve, 10));
  dispatchQueue(1, "recovered-accepted");
  await until(
    () =>
      db
        .select()
        .from(chatInputs)
        .where(eq(chatInputs.id, acceptedRow.id))
        .get()!.state === "sent",
  );
  assert.equal(accepted.deliveries.length, 0);

  createConversation("recovered-missing");
  const missing = fakeState("recovered-missing");
  missing.busy = true;
  await submitMessage(1, input("recovered-missing", "never confirmed"));
  const missingRow = db
    .select()
    .from(chatInputs)
    .where(eq(chatInputs.conversationId, "recovered-missing"))
    .get()!;
  db.update(chatInputs)
    .set({ state: "sending" })
    .where(eq(chatInputs.id, missingRow.id))
    .run();
  missing.busy = false;
  await new Promise((resolve) => setTimeout(resolve, 10));
  dispatchQueue(1, "recovered-missing");
  await until(
    () => queuedMessages(1, "recovered-missing")[0]?.state === "error",
  );
  assert.equal(
    queuedMessages(1, "recovered-missing")[0].errorKind,
    "uncertain",
  );
  assert.equal(missing.deliveries.length, 0);
  deleteQueuedMessage(
    1,
    "recovered-missing",
    queuedMessages(1, "recovered-missing")[0].id,
  );
  assert.equal(queuedMessages(1, "recovered-missing").length, 0);
});

test("conversation settings persist through the routes and provider stays locked", async () => {
  const { authRoute, csrfProtection } = await import("../src/auth/auth.js");
  const { chatRoute } = await import("../src/routes/chat.js");
  const { settingsRoute } = await import("../src/routes/settings.js");
  const registration = providerRegistration("muse")!;
  const opencodeRegistration = providerRegistration("opencode")!;
  const originalDetect = registration.detectCLI;
  const originalCatalog = registration.discoverCatalog;
  const originalOpencodeDetect = opencodeRegistration.detectCLI;
  registration.detectCLI = async () => ({ installed: true, version: "test" });
  opencodeRegistration.detectCLI = async () => ({
    installed: false,
    version: "",
  });
  registration.discoverCatalog = async () => ({
    id: "muse",
    name: "Muse",
    available: true,
    error: "",
    source: "test",
    models: [model("muse-spark-1.3"), model("muse-spark-1.2")],
  });
  const app = new Hono();
  app.use("/api/*", csrfProtection);
  app.route("/api/auth", authRoute);
  app.route("/api/chat", chatRoute);
  app.route("/api/settings", settingsRoute);

  async function request(
    path: string,
    cookie = "",
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ) {
    return app.request(
      `${origin}/api/${path}`,
      {
        method,
        headers: {
          Origin: origin,
          Host: "localhost:31993",
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
          Cookie: cookie,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      {
        incoming: {
          socket: {
            remoteAddress: "127.0.0.1",
            remotePort: 31993,
            remoteFamily: "IPv4",
          },
        },
      },
    );
  }

  try {
    const registered = await request("auth/register", "", {
      username: "reliability-http",
      password: "reliability-test-password",
    });
    assert.equal(registered.status, 200);
    const owner = registered.headers.get("set-cookie")!.split(";")[0];
    const status = (await (await request("auth/status", owner)).json()) as {
      user: { id: number };
    };
    const section = db
      .select()
      .from(sidebarSections)
      .where(eq(sidebarSections.userId, status.user.id))
      .get()!;
    assert.equal(
      (
        await request(
          "chat/sessions",
          owner,
          {
            sessions: [
              {
                id: "settings-chat",
                title: "Settings",
                projectId: null,
                sectionId: section.id,
                providerId: "muse",
                modelId: "muse-spark-1.3",
                reasoningEffort: "low",
              },
            ],
          },
          "PUT",
        )
      ).status,
      200,
    );
    let session = (
      (await (await request("chat/sessions/settings-chat", owner)).json()) as {
        session: { reasoningEffort?: string; permissionMode?: string };
      }
    ).session;
    assert.equal(session.reasoningEffort, "low");
    assert.equal(
      (
        await request("chat/sessions/settings-chat/settings", owner, {
          reasoningEffort: "high",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("chat/sessions/settings-chat/settings", owner, {
          reasoningEffort: "turbo",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("chat/sessions/settings-chat/mode", owner, {
          mode: "allowAll",
        })
      ).status,
      200,
    );
    session = (
      (await (await request("chat/sessions/settings-chat", owner)).json()) as {
        session: { reasoningEffort?: string; permissionMode?: string };
      }
    ).session;
    assert.equal(session.reasoningEffort, "high");
    assert.equal(session.permissionMode, "allowAll");
    const restored = readConversation(status.user.id, "settings-chat")!;
    assert.equal(restored.reasoningEffort, "high");
    assert.equal(restored.permissionMode, "allowAll");
    assert.equal(
      (
        await request("chat", owner, {
          conversationId: "settings-chat",
          messageId: crypto.randomUUID(),
          providerId: "muse",
          modelId: "muse-spark-1.3",
          permissionMode: "allowAll",
          reasoningEffort: "high",
          systemPrompt: "",
          messages: [{ role: "user", text: "hello" }],
        })
      ).status,
      202,
    );
    assert.equal(
      (
        await request("chat", owner, {
          conversationId: "settings-chat",
          messageId: crypto.randomUUID(),
          providerId: "opencode",
          modelId: "muse-spark-1.3",
          permissionMode: "allowAll",
          reasoningEffort: "high",
          systemPrompt: "",
          messages: [{ role: "user", text: "switch" }],
        })
      ).status,
      409,
    );
  } finally {
    registration.detectCLI = originalDetect;
    registration.discoverCatalog = originalCatalog;
    opencodeRegistration.detectCLI = originalOpencodeDetect;
  }
});

test("queue cleanup restores the provider", () => {
  stopMessageQueue();
  Object.assign(provider, originalProvider);
  closeDb();
  rmSync(folder, { recursive: true, force: true });
});
