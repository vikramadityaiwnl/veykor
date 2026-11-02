import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { ChatDefaults, QueuedChatMessage } from "@veykor/shared";

test("queue routes enforce ownership, validation, provider lock and saved delivery preference", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-queue-routes-"));
  const origin = "http://localhost:31992";
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: "queue-route-tests-with-at-least-thirty-two-bytes",
    AUTH_COOKIE_SECURE: "false",
    AUTH_ORIGINS: origin,
    DATABASE_URL: join(folder, "test.db"),
    PORT: "31992",
  });
  const { db, runMigrations, closeDb } = await import("../src/db/client.js");
  const { sidebarSections } = await import("../src/db/schema.js");
  const { authRoute, csrfProtection } = await import("../src/auth/auth.js");
  const { chatRoute } = await import("../src/routes/chat.js");
  const { settingsRoute } = await import("../src/routes/settings.js");
  const { providerRegistration } = await import("../src/providers/index.js");
  const { metadataSession, readConversation } =
    await import("../src/chat/conversations.js");
  const { model } = await import("../src/providers/muse/models.js");
  const { stopMessageQueue } = await import("../src/chat/message-queue.js");
  runMigrations();
  const muse = providerRegistration("muse")!;
  const opencode = providerRegistration("opencode")!;
  const provider = muse.chat!;
  const original = { ...provider };
  const originalMuse = {
    detectCLI: muse.detectCLI,
    discoverCatalog: muse.discoverCatalog,
  };
  const originalOpenCode = { detectCLI: opencode.detectCLI };
  let steers = 0;
  muse.detectCLI = async () => ({ installed: true, version: "test" });
  muse.discoverCatalog = async () => ({
    id: "muse",
    name: "Muse",
    available: true,
    error: "",
    source: "test",
    models: [model("muse-spark-1.3")],
  });
  opencode.detectCLI = async () => ({ installed: false, version: "" });
  provider.isBusy = () => true;
  provider.describe = async (userId, id) => ({
    ...metadataSession(readConversation(userId, id)!),
    status: "running",
  });
  provider.open = provider.describe;
  provider.steer = async () => {
    steers += 1;
  };
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
          Host: "localhost:31992",
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
            remotePort: 31992,
            remoteFamily: "IPv4",
          },
        },
      },
    );
  }

  try {
    const first = await request("auth/register", "", {
      username: "queue-one",
      password: "queue-test-password-long",
    });
    assert.equal(first.status, 200);
    const owner = first.headers.get("set-cookie")!.split(";")[0];
    const second = await request("auth/register", "", {
      username: "queue-two",
      password: "queue-test-password-long",
    });
    assert.equal(second.status, 200);
    const other = second.headers.get("set-cookie")!.split(";")[0];
    const section = db
      .select()
      .from(sidebarSections)
      .where(eq(sidebarSections.userId, 1))
      .get()!;
    assert.equal(
      (
        await request(
          "chat/sessions",
          owner,
          {
            sessions: [
              {
                id: "queued-chat",
                title: "Queue",
                projectId: null,
                sectionId: section.id,
                providerId: "muse",
                modelId: "muse-spark-1.3",
              },
            ],
          },
          "PUT",
        )
      ).status,
      200,
    );
    const input = {
      conversationId: "queued-chat",
      messageId: crypto.randomUUID(),
      providerId: "muse",
      modelId: "muse-spark-1.3",
      permissionMode: "promptUnmatched",
      reasoningEffort: "low",
      systemPrompt: "",
      messages: [{ role: "user", text: "queued text" }],
    };
    assert.equal((await request("chat", owner, input)).status, 202);
    assert.equal((await request("chat", owner, input)).status, 202);
    const snapshot = (await (
      await request("chat/sessions/queued-chat", owner)
    ).json()) as { session: { queuedMessages: QueuedChatMessage[] } };
    assert.equal(snapshot.session.queuedMessages.length, 1);
    const path = `chat/sessions/queued-chat/queue/${snapshot.session.queuedMessages[0].id}`;
    assert.equal(
      (await request(path, "", { text: "forged" }, "PATCH")).status,
      401,
    );
    assert.equal(
      (await request(path, other, { text: "forged" }, "PATCH")).status,
      404,
    );
    assert.equal((await request(path, other, undefined, "DELETE")).status, 404);
    assert.equal((await request(`${path}/steer`, other, {})).status, 404);
    assert.equal(
      (await request(path, owner, { text: "" }, "PATCH")).status,
      400,
    );
    assert.equal(
      (await request(path, owner, { text: "edited" }, "PATCH")).status,
      200,
    );
    assert.equal(
      (
        (await (await request("chat/sessions/queued-chat", owner)).json()) as {
          session: { queuedMessages: QueuedChatMessage[] };
        }
      ).session.queuedMessages[0].text,
      "edited",
    );
    assert.equal(
      (
        await request("chat", owner, {
          ...input,
          messageId: crypto.randomUUID(),
          providerId: "opencode",
        })
      ).status,
      409,
    );
    assert.equal((await request(`${path}/steer`, owner, {})).status, 200);
    assert.equal(steers, 1);
    assert.equal(
      (await request(path, owner, { text: "too late" }, "PATCH")).status,
      409,
    );
    const defaults = {
      messageBehavior: "steer",
      defaultProviderId: "",
      models: {},
      efforts: {},
      permissionMode: "promptUnmatched",
    };
    assert.equal(
      (await request("settings/chat-defaults", owner, defaults, "PUT")).status,
      200,
    );
    assert.equal(
      (
        (await (
          await request("settings/chat-defaults", owner)
        ).json()) as ChatDefaults
      ).messageBehavior,
      "steer",
    );
    assert.equal(
      (
        await request("chat", owner, {
          ...input,
          messageId: crypto.randomUUID(),
        })
      ).status,
      202,
    );
    assert.equal(steers, 2);
    assert.equal(
      (
        await request("chat", owner, {
          ...input,
          messageId: crypto.randomUUID(),
          delivery: "invented",
        })
      ).status,
      400,
    );
  } finally {
    stopMessageQueue();
    Object.assign(provider, original);
    Object.assign(muse, originalMuse);
    Object.assign(opencode, originalOpenCode);
    closeDb();
    rmSync(folder, { recursive: true, force: true });
  }
});
