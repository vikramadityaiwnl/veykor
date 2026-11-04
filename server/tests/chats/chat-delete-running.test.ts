import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import type { Connection } from "@muse-code/sdk";

const folder = mkdtempSync(join(tmpdir(), "veykor-chat-delete-"));

process.env["DATABASE_URL"] = join(folder, "test.db");

const { chatRoute } = await import("../../src/chats/chats.ts");
const { db } = await import("../../src/db/client.ts");
const { chats, sessions, users } = await import("../../src/db/schema.ts");
const { museHost } = await import("../../src/muse/muse-host.ts");
const { runMuseTurn } = await import("../../src/muse/chat-service.ts");
const { isMuseTurnRunning } = await import("../../src/muse/chat-service.ts");
const { veykorRequestHeaderName, veykorRequestHeaderValue } =
  await import("@veykor/shared");

const owner = db
  .insert(users)
  .values({ username: "chat-delete-owner" })
  .returning()
  .get();

db.insert(sessions)
  .values({
    id: "chat-delete-session",
    userId: owner.id,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  })
  .run();

db.insert(chats)
  .values({
    id: "chat-delete-running",
    userId: owner.id,
    title: "Running chat",
    museSessionId: "muse-delete-running",
  })
  .run();

const originalConnection = museHost.connection;
const originalSubscribe = museHost.subscribe;
let leaveFails = true;
let leaveCalls = 0;
const unloadedSessions = new Map<string, string>();
let notifyTurn:
  | ((notification: {
      method: string;
      params: Record<string, unknown>;
    }) => void)
  | null = null;
let markStarted: (() => void) | null = null;

museHost.connection = async () =>
  ({
    command: async (method: string, params: Record<string, unknown>) => {
      if (method === "turn/start") {
        markStarted?.();

        return { turnId: "delete-test-turn" };
      }

      if (method === "session/leave") {
        leaveCalls += 1;
        const kind = unloadedSessions.get(String(params["sessionId"]));

        if (kind) {
          throw Object.assign(
            new Error("Session is unavailable on this host"),
            { kind },
          );
        }

        if (leaveFails) {
          throw new Error("Muse leave failed");
        }
      }

      return {};
    },
    request: async () => ({ items: [] }),
  }) as unknown as Connection;

museHost.subscribe = (_sessionId, listener) => {
  notifyTurn = listener;

  return () => {
    notifyTurn = null;
  };
};

async function deleteChat() {
  return chatRoute.request("/chat-delete-running", {
    method: "DELETE",
    headers: {
      Cookie: "veykor_session=chat-delete-session",
      [veykorRequestHeaderName]: veykorRequestHeaderValue,
    },
  });
}

test("chat deletion guards active work and failures while allowing unloaded teams", async () => {
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const turn = runMuseTurn({
    museSessionId: "muse-delete-running",
    text: "test turn",
    images: [],
    onEvent: () => {},
  });

  try {
    await started;
    assert.equal(isMuseTurnRunning("muse-delete-running"), true);

    const blocked = await deleteChat();

    assert.equal(blocked.status, 409);
    assert.equal(leaveCalls, 0);

    notifyTurn?.({
      method: "turn/completed",
      params: {
        turnId: "delete-test-turn",
        terminal: "completed",
        durationMs: 1,
      },
    });
    await turn;

    assert.equal(isMuseTurnRunning("muse-delete-running"), false);

    const leaveFailed = await deleteChat();

    assert.equal(leaveFailed.status, 502);
    assert.equal(
      db
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.id, "chat-delete-running"))
        .all().length,
      1,
    );

    leaveFails = false;

    const deleted = await deleteChat();

    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { deleted: true });
    assert.equal(leaveCalls, 2);
    assert.equal(
      db
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.id, "chat-delete-running"))
        .all().length,
      0,
    );
    for (const kind of ["sessionNotLoaded", "sessionNotFound"]) {
      const rootId = `unloaded-${kind}`;
      const childId = `${rootId}-child`;

      for (const id of [rootId, childId]) {
        unloadedSessions.set(id, kind);
        db.insert(chats)
          .values({
            id,
            userId: owner.id,
            museSessionId: id,
            parentChatId: id === childId ? rootId : "",
          })
          .run();
      }

      const response = await chatRoute.request(`/${rootId}`, {
        method: "DELETE",
        headers: {
          Cookie: "veykor_session=chat-delete-session",
          [veykorRequestHeaderName]: veykorRequestHeaderValue,
        },
      });

      assert.equal(response.status, 200);
      assert.equal(
        db.select().from(chats).where(eq(chats.id, rootId)).all().length,
        0,
      );
      assert.equal(
        db.select().from(chats).where(eq(chats.id, childId)).all().length,
        0,
      );
    }
  } finally {
    notifyTurn?.({
      method: "turn/completed",
      params: { turnId: "delete-test-turn", terminal: "completed" },
    });
    await turn.catch(() => {});
    museHost.connection = originalConnection;
    museHost.subscribe = originalSubscribe;
    rmSync(folder, { recursive: true, force: true });
  }
});
