import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Connection } from "@muse-code/sdk";
import { museHost } from "../../src/muse/muse-host.ts";
import type { MuseNotification } from "../../src/muse/muse-host.ts";

const folder = mkdtempSync(join(tmpdir(), "veykor-stream-test-"));
process.env["DATABASE_URL"] = join(folder, "test.db");
const { runMuseTurn, toHistoryItem } =
  await import("../../src/muse/chat-service.ts");

test("turn projection hides raw user context, ignores old turns and uses durable measured timing", async () => {
  const connection = museHost.connection;
  const subscribe = museHost.subscribe;
  const events: Array<Record<string, unknown>> = [];
  let notify!: (event: MuseNotification) => void;
  const raw =
    '<veykor-agent-context version="1">\nprofile\n</veykor-agent-context>\n\nhello';

  museHost.subscribe = (_id, listener) => {
    notify = listener;
    return () => {};
  };
  museHost.connection = async () =>
    ({
      command: async () => {
        queueMicrotask(() => {
          notify({ method: "turn/started", params: { turnId: "current" } });
          notify({
            method: "item/started",
            params: {
              item: {
                kind: "userMessage",
                itemId: "old",
                turnId: "previous",
                text: "old user",
              },
            },
          });
          notify({
            method: "item/started",
            params: {
              item: {
                kind: "userMessage",
                itemId: "user",
                turnId: "current",
                text: raw,
              },
            },
          });
          notify({
            method: "item/delta",
            params: { itemId: "user", delta: raw },
          });
          notify({
            method: "turn/completed",
            params: { turnId: "current", terminal: "completed" },
          });
        });

        return { turnId: "current" };
      },
      request: async () => ({
        events: [
          {
            method: "turn/completed",
            params: { turnId: "current", durationMs: 6000 },
          },
        ],
      }),
    }) as unknown as Connection;

  try {
    await runMuseTurn({
      museSessionId: "test",
      text: raw,
      displayText: "hello",
      images: [],
      onEvent: (event) => {
        events.push(event);
      },
    });
    assert.equal(
      events.filter((event) => event.type === "turn-started").length,
      1,
    );
    const items = events
      .filter((event) => event.type === "item")
      .map((event) => event.item as { itemId: string; text: string });
    assert.deepEqual(items, [{ ...items[0], itemId: "user", text: "hello" }]);
    assert.equal(
      events.some((event) => event.type === "delta"),
      false,
    );
    assert.equal(events.at(-1)?.type, "turn-completed");
    assert.equal(events.at(-1)?.durationMs, 6000);
    assert.equal(
      toHistoryItem({ kind: "userMessage", text: raw, displayText: "" }).text,
      "",
    );
  } finally {
    museHost.connection = connection;
    museHost.subscribe = subscribe;
    rmSync(folder, { recursive: true, force: true });
  }
});

test("a delayed start acknowledgement cannot restart a turn after its terminal event", async () => {
  const connection = museHost.connection;
  const subscribe = museHost.subscribe;
  const events: string[] = [];
  let acknowledge!: (value: { turnId: string }) => void;
  let notify!: (event: MuseNotification) => void;
  museHost.subscribe = (_id, listener) => {
    notify = listener;
    return () => {};
  };
  museHost.connection = async () =>
    ({
      command: () => {
        queueMicrotask(() =>
          notify({
            method: "turn/completed",
            params: { turnId: "late", terminal: "completed", durationMs: 6000 },
          }),
        );

        return new Promise((resolve) => {
          acknowledge = resolve;
        });
      },
    }) as unknown as Connection;

  try {
    await runMuseTurn({
      museSessionId: "late-test",
      text: "hello",
      images: [],
      onEvent: (event) => {
        events.push(event.type);
      },
    });
    acknowledge({ turnId: "late" });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(events, ["turn-completed"]);
  } finally {
    museHost.connection = connection;
    museHost.subscribe = subscribe;
  }
});
