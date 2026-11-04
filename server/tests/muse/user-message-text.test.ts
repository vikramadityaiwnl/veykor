import { buildMemoryContextBlock, questionTurnReminder } from "@veykor/shared";
import assert from "node:assert/strict";
import { test } from "node:test";
import { userMessageText } from "../../src/muse/user-message-text.ts";
import { previewGuidanceText } from "../../src/teams/team-context.ts";
import { compileAgentContext } from "../../src/work/agent-context.ts";

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

test("envelopes are stripped anywhere they appear", () => {
  const message = (id: number, text: string) =>
    `<veykor-team-message version="1">\n{"id":${id},"kind":"delegated","text":"${text}"}\n</veykor-team-message>`;
  const context =
    '<veykor-team-context version="1">\nroster\n</veykor-team-context>';

  assert.equal(
    userMessageText(`${message(1, "Test Java")}\n\nShip it`, undefined),
    "Ship it",
  );
  assert.equal(
    userMessageText(`Ship it\n\n${message(1, "Test Java")}`, undefined),
    "Ship it",
  );
  assert.equal(
    userMessageText(`${message(1, "One")}\n${message(2, "Two")}`, undefined),
    "",
  );
  assert.equal(
    userMessageText(
      `${context}\n${message(1, "Test Java")}\n\nShip it`,
      undefined,
    ),
    "Ship it",
  );
  assert.equal(
    userMessageText(`Before\n${context}\nAfter`, undefined),
    "Before\n\nAfter",
  );
  assert.equal(
    userMessageText(
      `Ship it\n${'<veykor-team-message version="1">\n{"id":3'}`,
      undefined,
    ),
    "Ship it",
  );
  assert.equal(
    userMessageText(`Hello\n${questionTurnReminder}\nWorld`, undefined),
    "Hello\n\nWorld",
  );
});

test("a realistic injected turn shows only the user text", () => {
  const agentContext = compileAgentContext(
    { id: "agent-main", name: "Main", description: "Main agent" },
    { name: "Project", folder: "/tmp/project" },
  );
  const memory = buildMemoryContextBlock([
    { id: "1", scope: "global", projectId: "", instruction: "Be brief." },
  ]);
  const teamContext = [
    '<veykor-team-context version="1">',
    "Your session ID is chat-1. Main chat: chat-1.",
    previewGuidanceText("/tmp/project/.veykor/previews"),
    questionTurnReminder,
    "</veykor-team-context>",
  ].join("\n");
  const raw = [agentContext, memory, teamContext].join("\n") + "\n\nShip it";

  assert.match(raw, /Image content returned by visual tools/);
  assert.equal(userMessageText(raw, undefined), "Ship it");
});

test("memory and legacy question guidance stay hidden around team inputs", () => {
  const context =
    '<veykor-memory-context version="1">\npreferences\n</veykor-memory-context>\n<veykor-team-context version="1">\nroster\n</veykor-team-context>\n';
  const message =
    '<veykor-team-message version="1">\n{"id":201,"kind":"completed","text":"SQLite"}\n</veykor-team-message>';
  const raw = context + questionTurnReminder + "\n\n" + message;

  assert.equal(userMessageText(raw, undefined), "");
  assert.equal(userMessageText(raw, raw), "");
  assert.equal(userMessageText(context + "Hello", undefined), "Hello");
});
