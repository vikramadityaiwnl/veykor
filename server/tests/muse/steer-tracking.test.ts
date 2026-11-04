import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Connection } from "@muse-code/sdk";
import { museHost } from "../../src/muse/muse-host.ts";
import type { MuseNotification } from "../../src/muse/muse-host.ts";

const folder = mkdtempSync(join(tmpdir(), "veykor-steer-test-"));
process.env["DATABASE_URL"] = join(folder, "test.db");
const {
  activeMuseTurn,
  cancelMuseTurn,
  isActiveMuseTurn,
  isMuseTurnRunning,
  runMuseTurn,
  steerMuseTurn,
} = await import("../../src/muse/chat-service.ts");

test("steered turns stay tracked as running until their terminal event", async () => {
  const connection = museHost.connection;
  const subscribe = museHost.subscribe;
  let notify!: (event: MuseNotification) => void;

  museHost.subscribe = (_id, listener) => {
    notify = listener;
    return () => {};
  };
  museHost.connection = async () =>
    ({
      command: async () => ({ turnId: "turn-2" }),
    }) as unknown as Connection;

  try {
    assert.equal(isMuseTurnRunning("steer-session"), false);
    await steerMuseTurn({
      museSessionId: "steer-session",
      expectedTurnId: "turn-1",
      text: "hello",
      images: [],
    });
    assert.equal(isMuseTurnRunning("steer-session"), true);
    assert.equal(activeMuseTurn("steer-session"), "turn-2");

    notify({
      method: "turn/completed",
      params: { turnId: "turn-1" },
    });
    assert.equal(isMuseTurnRunning("steer-session"), true);

    notify({
      method: "turn/completed",
      params: { turnId: "turn-2" },
    });
    assert.equal(isMuseTurnRunning("steer-session"), false);
    assert.equal(activeMuseTurn("steer-session"), "");
  } finally {
    museHost.connection = connection;
    museHost.subscribe = subscribe;
  }
});

test("a refused steer leaves the session untracked", async () => {
  const connection = museHost.connection;

  museHost.connection = async () =>
    ({
      command: async () => {
        throw new Error("not the running turn");
      },
    }) as unknown as Connection;

  try {
    await assert.rejects(() =>
      steerMuseTurn({
        museSessionId: "refused-session",
        expectedTurnId: "stale",
        text: "hello",
        images: [],
      }),
    );
    assert.equal(isMuseTurnRunning("refused-session"), false);
  } finally {
    museHost.connection = connection;
  }
});

test("a steered main turn completes when the replacement turn completes", async () => {
  const connection = museHost.connection;
  const subscribe = museHost.subscribe;
  const listeners: Array<(event: MuseNotification) => void> = [];
  const events: Array<{ type: string; turnId?: string }> = [];
  let resolveInitialTurn!: () => void;
  const initialTurnStarted = new Promise<void>((resolve) => {
    resolveInitialTurn = resolve;
  });

  museHost.subscribe = (_id, listener) => {
    listeners.push(listener);
    return () => {};
  };
  museHost.connection = async () =>
    ({
      command: async (method: string) =>
        method === "turn/start" ? { turnId: "turn-1" } : { turnId: "turn-2" },
      request: async () => ({ events: [], nextCursor: "" }),
    }) as unknown as Connection;

  try {
    const running = runMuseTurn({
      museSessionId: "main-session",
      previewRoot: folder,
      text: "Handle the delegated result.",
      images: [],
      onEvent: (event) => {
        events.push(event);

        if (event.type === "turn-started" && event.turnId === "turn-1") {
          resolveInitialTurn();
        }
      },
    });

    await initialTurnStarted;
    await steerMuseTurn({
      museSessionId: "main-session",
      expectedTurnId: "turn-1",
      text: "The teammate finished.",
      images: [],
    });

    assert.equal(activeMuseTurn("main-session"), "turn-2");
    assert.equal(isMuseTurnRunning("main-session"), true);

    for (const listener of listeners) {
      listener({
        method: "turn/completed",
        params: { turnId: "turn-1" },
      });
    }

    assert.equal(isMuseTurnRunning("main-session"), true);

    for (const listener of listeners) {
      listener({
        method: "turn/completed",
        params: { turnId: "turn-2", durationMs: 100 },
      });
    }

    await running;

    assert.equal(isMuseTurnRunning("main-session"), false);
    assert.ok(
      events.some(
        (event) => event.type === "turn-completed" && event.turnId === "turn-2",
      ),
    );
  } finally {
    museHost.connection = connection;
    museHost.subscribe = subscribe;
  }
});

test("a replacement start notification retargets the main turn when steer omits its id", async () => {
  const connection = museHost.connection;
  const subscribe = museHost.subscribe;
  let notify!: (event: MuseNotification) => void;
  let resolveInitialTurn!: () => void;
  const initialTurnStarted = new Promise<void>((resolve) => {
    resolveInitialTurn = resolve;
  });

  museHost.subscribe = (_id, listener) => {
    notify = listener;
    return () => {};
  };
  museHost.connection = async () =>
    ({
      command: async (method: string) =>
        method === "turn/start" ? { turnId: "turn-1" } : {},
      request: async () => ({ events: [], nextCursor: "" }),
    }) as unknown as Connection;

  try {
    const running = runMuseTurn({
      museSessionId: "main-session-with-acknowledgement-gap",
      previewRoot: folder,
      text: "Handle the delegated result.",
      images: [],
      onEvent: (event) => {
        if (event.type === "turn-started" && event.turnId === "turn-1") {
          resolveInitialTurn();
        }
      },
    });

    await initialTurnStarted;
    await steerMuseTurn({
      museSessionId: "main-session-with-acknowledgement-gap",
      expectedTurnId: "turn-1",
      text: "The teammate finished.",
      images: [],
    });

    notify({ method: "turn/started", params: { turnId: "turn-2" } });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      activeMuseTurn("main-session-with-acknowledgement-gap"),
      "turn-2",
    );
    assert.equal(
      isMuseTurnRunning("main-session-with-acknowledgement-gap"),
      true,
    );

    notify({ method: "turn/completed", params: { turnId: "turn-1" } });
    assert.equal(
      isMuseTurnRunning("main-session-with-acknowledgement-gap"),
      true,
    );

    notify({
      method: "turn/completed",
      params: { turnId: "turn-2", durationMs: 100 },
    });
    await running;

    assert.equal(
      isMuseTurnRunning("main-session-with-acknowledgement-gap"),
      false,
    );
  } finally {
    museHost.connection = connection;
    museHost.subscribe = subscribe;
  }
});

test("a stale turn id cancels the active steered turn", async () => {
  const connection = museHost.connection;
  const subscribe = museHost.subscribe;
  let notify!: (event: MuseNotification) => void;
  let resolveInitialTurn!: () => void;
  let cancelledTurnId = "";
  const initialTurnStarted = new Promise<void>((resolve) => {
    resolveInitialTurn = resolve;
  });

  museHost.subscribe = (_id, listener) => {
    notify = listener;
    return () => {};
  };
  museHost.connection = async () =>
    ({
      command: async (method: string, params: Record<string, unknown>) => {
        if (method === "turn/start") {
          return { turnId: "turn-1" };
        }

        if (method === "turn/steer") {
          return { turnId: "turn-2" };
        }

        if (method === "turn/cancel") {
          cancelledTurnId = String(params["turnId"]);
        }

        return {};
      },
      request: async () => ({ events: [], nextCursor: "" }),
    }) as unknown as Connection;

  try {
    const running = runMuseTurn({
      museSessionId: "cancel-after-steer",
      previewRoot: folder,
      text: "Run the main turn.",
      images: [],
      onEvent: (event) => {
        if (event.type === "turn-started" && event.turnId === "turn-1") {
          resolveInitialTurn();
        }
      },
    });

    await initialTurnStarted;
    await steerMuseTurn({
      museSessionId: "cancel-after-steer",
      expectedTurnId: "turn-1",
      text: "The teammate finished.",
      images: [],
    });

    assert.equal(isActiveMuseTurn("cancel-after-steer", "turn-1"), true);
    assert.equal(activeMuseTurn("cancel-after-steer"), "turn-2");
    await cancelMuseTurn("cancel-after-steer", "turn-1");
    assert.equal(cancelledTurnId, "turn-2");

    notify({
      method: "turn/completed",
      params: { turnId: "turn-2", terminal: "cancelled" },
    });
    await running;
  } finally {
    museHost.connection = connection;
    museHost.subscribe = subscribe;
  }
});
