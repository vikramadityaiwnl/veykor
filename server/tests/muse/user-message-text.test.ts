import assert from "node:assert/strict";
import { test } from "node:test";
import { userMessageText } from "../../src/muse/user-message-text.ts";

test("live and restored user messages hide agent context before presentation metadata arrives", () => {
  const raw =
    '<veykor-agent-context version="1">\nlarge private profile\n</veykor-agent-context>\n\nhello';
  assert.equal(userMessageText(raw, undefined), "hello");
  assert.equal(userMessageText(raw, "Visible input"), "Visible input");
  assert.equal(userMessageText(raw, ""), "");
  assert.equal(
    userMessageText(
      '<veykor-agent-context version="1">\nincomplete',
      undefined,
    ),
    "",
  );
  assert.equal(
    userMessageText(
      '<agent-instructions name="Planner">\nlegacy context\n</agent-instructions>\n\nlegacy input',
      undefined,
    ),
    "legacy input",
  );
  assert.equal(userMessageText("ordinary input", undefined), "ordinary input");
});
