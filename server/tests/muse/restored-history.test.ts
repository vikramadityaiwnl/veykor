import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

const folder = mkdtempSync(join(tmpdir(), "veykor-history-test-"));
process.env["DATABASE_URL"] = join(folder, "test.db");
const { restoreHistoryItems } = await import("../../src/muse/chat-service.ts");

test("restored history keeps empty internal user messages as thinking anchors", () => {
  const items = restoreHistoryItems([
    {
      itemId: "user-1",
      kind: "userMessage",
      status: "completed",
      turnId: "turn-1",
      text: '<veykor-team-message version="1">\n{"id":16,"kind":"delegated","text":"Test Java"}\n</veykor-team-message>',
      displayText: "",
      recordedAt: "2026-01-01T00:00:00.000Z",
      attachments: [],
    },
    {
      itemId: "user-2",
      kind: "userMessage",
      status: "completed",
      turnId: "turn-2",
      text: "hello",
      recordedAt: "2026-01-01T00:01:00.000Z",
      attachments: [],
    },
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0]?.kind, "userMessage");
  assert.equal(items[0]?.turnId, "turn-1");
  assert.equal(items[0]?.text, "");
  assert.equal(items[1]?.text, "hello");
});
