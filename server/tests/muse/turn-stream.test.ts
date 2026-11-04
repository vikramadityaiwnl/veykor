import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Connection } from "@muse-code/sdk";
import { museHost } from "../../src/muse/muse-host.ts";
import type { MuseNotification } from "../../src/muse/muse-host.ts";

const folder = mkdtempSync(join(tmpdir(), "veykor-stream-test-"));
process.env["DATABASE_URL"] = join(folder, "test.db");
const { readPreviewForItem, runMuseTurn, toHistoryItem } =
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
      previewRoot: folder,
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
      previewRoot: folder,
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

test("durable terminal history releases a turn when its live completion was missed", async () => {
  const { readMuseChat, isMuseTurnRunning } =
    await import("../../src/muse/chat-service.ts");
  const connection = museHost.connection;
  const subscribe = museHost.subscribe;
  const events: string[] = [];
  const todos: unknown[][] = [];
  let notify!: (event: MuseNotification) => void;
  museHost.subscribe = (_id, listener) => {
    notify = listener;
    return () => {};
  };
  museHost.connection = async () =>
    ({
      command: async (method: string) => {
        if (method === "turn/start") {
          queueMicrotask(() => {
            notify({ method: "turn/started", params: { turnId: "recovered" } });
            notify({
              method: "session/todoListChanged",
              params: {
                items: [{ text: "Verify", status: "completed" }],
                revision: 1,
              },
            });
            notify({
              method: "session/todoListChanged",
              params: { items: [], revision: 2 },
            });
          });
          return { turnId: "recovered" };
        }
        return { session: {}, history: { items: [] } };
      },
      request: async (method: string) =>
        method === "view/page"
          ? {
              events: [
                {
                  method: "turn/completed",
                  params: {
                    turnId: "recovered",
                    terminal: "completed",
                    durationMs: 0,
                  },
                },
              ],
            }
          : { approvals: [] },
    }) as unknown as Connection;

  try {
    const pending = runMuseTurn({
      museSessionId: "recovery",
      previewRoot: folder,
      text: "hello",
      images: [],
      onEvent: (event) => {
        events.push(event.type);
      },
      onTodoSnapshot: (snapshot) => {
        todos.push(snapshot.items);
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(isMuseTurnRunning("recovery"), true);
    const detail = await readMuseChat({
      id: "recovery",
      title: "",
      sectionId: "",
      projectId: "",
      agentId: "",
      agentName: "",
      museSessionId: "recovery",
      running: true,
      createdAt: "",
      updatedAt: "",
    });
    await pending;
    assert.equal(detail.running, false);
    assert.equal(isMuseTurnRunning("recovery"), false);
    assert.equal(
      events.filter((event) => event === "turn-completed").length,
      1,
    );
    assert.deepEqual(todos, [[{ text: "Verify", status: "completed" }], []]);
  } finally {
    museHost.connection = connection;
    museHost.subscribe = subscribe;
  }
});

test("tool image outputs forward as previews before the terminal event", async () => {
  const connection = museHost.connection;
  const subscribe = museHost.subscribe;
  const events: Array<Record<string, unknown>> = [];
  const previewDirectory = join(folder, "previews");
  const screenshotPath = join(previewDirectory, "browser-capture.png");
  const outsideScreenshotPath = join(folder, "outside.png");
  let notify!: (event: MuseNotification) => void;

  mkdirSync(previewDirectory, { recursive: true });
  writeFileSync(screenshotPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(outsideScreenshotPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const shot = {
    kind: "toolCall",
    itemId: "shot",
    turnId: "current",
    tool: "mcp__camera__capture_frame",
    status: "completed",
    outputRef: {
      id: "ref-shot",
      mediaType: "image/png",
      availability: "available",
      kind: "tool_output",
      uri: "output://shot",
      byteLen: 5,
    },
  };

  museHost.subscribe = (_id, listener) => {
    notify = listener;
    return () => {};
  };
  museHost.connection = async () =>
    ({
      command: async () => {
        queueMicrotask(() => {
          notify({ method: "turn/started", params: { turnId: "current" } });
          notify({ method: "item/completed", params: { item: shot } });
          notify({
            method: "item/completed",
            params: {
              item: {
                ...shot,
                itemId: "shot-with-content-metadata",
                outputRef: {
                  ...shot.outputRef,
                  id: "ref-shot-content-metadata",
                  mediaType: undefined,
                },
                modelVisibleContent: [
                  {
                    type: "image",
                    mediaType: "image/webp",
                    sourceToolName: "mcp__camera__capture_frame",
                    path: "output://shot",
                  },
                ],
              },
            },
          });
          notify({
            method: "item/completed",
            params: {
              item: {
                kind: "toolCall",
                itemId: "inline-image",
                turnId: "current",
                tool: "mcp__vision__capture_frame",
                status: "completed",
                modelVisibleContent: [
                  {
                    type: "image",
                    mediaType: "image/png",
                    base64Data: "iVBORw==",
                  },
                ],
              },
            },
          });
          notify({
            method: "item/completed",
            params: {
              item: {
                kind: "toolCall",
                itemId: "outside-shot",
                turnId: "current",
                tool: "mcp__agent_device__capture_frame",
                status: "completed",
                args: JSON.stringify({ filePath: outsideScreenshotPath }),
              },
            },
          });
          notify({
            method: "item/completed",
            params: {
              item: {
                kind: "toolCall",
                itemId: "shot-from-file",
                turnId: "current",
                tool: "mcp__agent_device__capture_frame",
                status: "completed",
                args: JSON.stringify({ filePath: screenshotPath }),
              },
            },
          });
          notify({
            method: "item/completed",
            params: {
              item: {
                kind: "toolCall",
                itemId: "shot-from-visible-output",
                turnId: "current",
                tool: "mcp__device__read_frame",
                status: "completed",
                visibleOutput: `Took a screenshot.\nSaved screenshot to ${screenshotPath}.`,
              },
            },
          });
          notify({
            method: "item/completed",
            params: {
              item: {
                ...shot,
                itemId: "gen",
                tool: "mcp__veykor_team__generate_image",
                outputRef: { ...shot.outputRef, id: "ref-gen" },
              },
            },
          });
          notify({
            method: "item/completed",
            params: {
              item: {
                ...shot,
                itemId: "text",
                tool: "mcp__browser__navigate",
                outputRef: { ...shot.outputRef, mediaType: "text/plain" },
              },
            },
          });
          notify({
            method: "turn/completed",
            params: { turnId: "current", terminal: "completed" },
          });
        });

        return { turnId: "current" };
      },
      request: async (method: string) => {
        if (method === "item/readOutput") {
          return {
            content: "iVBORw==",
            encoding: "base64",
            mediaType: "image/png",
            byteLen: 5,
            eof: true,
            offsetBytes: 0,
          };
        }

        return { events: [] };
      },
    }) as unknown as Connection;

  try {
    await runMuseTurn({
      museSessionId: "screenshot-test",
      previewRoot: previewDirectory,
      text: "go",
      images: [],
      onEvent: (event) => {
        events.push(event);
      },
    });

    const previews = events.filter((event) => event.type === "preview");
    assert.equal(previews.length, 5);
    const previewsByItemId = new Map(
      previews.map((event) => [(event as { itemId: string }).itemId, event]),
    );
    assert.deepEqual(previewsByItemId.get("shot"), {
      type: "preview",
      itemId: "shot",
      mediaType: "image/png",
      base64Data: "iVBORw==",
    });
    assert.deepEqual(previewsByItemId.get("shot-with-content-metadata"), {
      type: "preview",
      itemId: "shot-with-content-metadata",
      mediaType: "image/webp",
      base64Data: "iVBORw==",
    });
    assert.deepEqual(previewsByItemId.get("inline-image"), {
      type: "preview",
      itemId: "inline-image",
      mediaType: "image/png",
      base64Data: "iVBORw==",
    });
    assert.deepEqual(previewsByItemId.get("shot-from-file"), {
      type: "preview",
      itemId: "shot-from-file",
      mediaType: "image/png",
      base64Data: "iVBORw==",
    });
    assert.deepEqual(previewsByItemId.get("shot-from-visible-output"), {
      type: "preview",
      itemId: "shot-from-visible-output",
      mediaType: "image/png",
      base64Data: "iVBORw==",
    });

    const order = events.map((event) => String(event.type));
    assert.ok(order.indexOf("preview") !== -1);
    assert.ok(order.indexOf("preview") < order.indexOf("turn-completed"));

    const savedPreview = await readPreviewForItem(
      toHistoryItem({
        kind: "toolCall",
        itemId: "shot",
        tool: "mcp__camera__capture_frame",
        args: "{}",
      }),
      previewDirectory,
    );

    assert.deepEqual(savedPreview, {
      mediaType: "image/png",
      base64Data: "iVBORw==",
    });
  } finally {
    museHost.connection = connection;
    museHost.subscribe = subscribe;
  }
});
