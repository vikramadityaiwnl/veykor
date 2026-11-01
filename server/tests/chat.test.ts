import { test } from "node:test";
import assert from "node:assert/strict";
import { validChatRequest, hasNonImageAttachment } from "../src/chat/chat-validation.js";
import { model } from "../src/chat/model-catalog.js";

const input = {
  conversationId: "conversation",
  messageId: "message",
  providerId: "muse",
  modelId: "muse-spark-1.3",
  permissionMode: "promptUnmatched",
  systemPrompt: "",
  messages: [{ role: "user", text: "Hello" }],
};

test("native chat validates Muse requests and rejects removed providers and invented modes", () => {
  assert.equal(validChatRequest(input), true);
  for (const providerId of [
    "aider",
    "claude",
    "codex",
    "opencode",
    "deepseek",
  ]) {
    assert.equal(validChatRequest({ ...input, providerId }), false);
  }
  for (const value of [
    null,
    {},
    { ...input, permissionMode: "auto" },
    { ...input, modelId: "--flag" },
    { ...input, messages: [null] },
    { ...input, messages: [] },
    { ...input, conversationId: null },
  ]) {
    assert.equal(validChatRequest(value), false);
  }
});

test("chat accepts image attachments and rejects other file kinds", () => {
  const image = {
    id: "attachment-1",
    name: "green.png",
    mimeType: "image/png",
    size: 100,
    kind: "image",
    dataUrl: "data:image/png;base64,Zm9v",
    text: "",
  };
  const withAttachments = (attachments: unknown[]) => ({
    ...input,
    messages: [{ role: "user", text: "Hello", attachments }],
  });

  assert.equal(validChatRequest(withAttachments([image])), true);
  assert.equal(
    validChatRequest(withAttachments([{ ...image, kind: "text" }])),
    false,
  );
  assert.equal(hasNonImageAttachment(withAttachments([image])), false);
  assert.equal(
    hasNonImageAttachment(withAttachments([{ ...image, kind: "pdf" }])),
    true,
  );
});

test("image input is advertised only for verified model families", () => {
  assert.deepEqual(model("muse-spark-1.3").inputModalities, ["text", "image"]);
  assert.deepEqual(model("unknown-model").inputModalities, ["text"]);
});
