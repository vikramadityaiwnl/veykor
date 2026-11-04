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

test("team protocol inputs stay internal in restored and live transcripts", () => {
  const legacy = "Team update #15 (started) from session 1234-abcd:\nTest Java";
  const message =
    '<veykor-team-message version="1">\n{"id":16,"kind":"delegated","text":"Test Java"}\n</veykor-team-message>';
  const context =
    '<veykor-agent-context version="1">\nprofile\n</veykor-agent-context>\n<veykor-team-context version="1">\nroster\n</veykor-team-context>\n\n';

  assert.equal(userMessageText(legacy, undefined), "");
  assert.equal(userMessageText(legacy, legacy), "");
  assert.equal(userMessageText(message, undefined), "");
  assert.equal(userMessageText(context + message, undefined), "");
  assert.equal(
    userMessageText(context + "Please test Java", undefined),
    "Please test Java",
  );
  assert.equal(
    userMessageText("Tell Planner I need Java", undefined),
    "Tell Planner I need Java",
  );
});
