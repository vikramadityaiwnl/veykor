import { test } from "node:test";
import assert from "node:assert/strict";
import { keyStatus, previewTranscriptionKey, validTranscriptionKey } from "../src/settings/transcription-key.js";

test("transcription keys preview without revealing the key", () => {
  assert.equal(previewTranscriptionKey(""), "");
  assert.equal(previewTranscriptionKey("short"), "••••••");
  assert.equal(
    previewTranscriptionKey("test-model-key-for-transcription"),
    "test…tion",
  );
  assert.deepEqual(keyStatus(""), { configured: false, preview: "" });
  assert.deepEqual(keyStatus("test-model-key-for-transcription"), {
    configured: true,
    preview: "test…tion",
  });
});

test("transcription keys accept overrides and clears, and reject malformed payloads", () => {
  assert.equal(validTranscriptionKey({ key: "test-model-key" }), true);
  assert.equal(validTranscriptionKey({ key: "" }), true);

  for (const value of [
    null,
    {},
    { key: 42 },
    { key: ["test-model-key"] },
    { key: "x".repeat(501) },
  ]) {
    assert.equal(validTranscriptionKey(value), false);
  }
});
