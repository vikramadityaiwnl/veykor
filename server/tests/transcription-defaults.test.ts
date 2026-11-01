import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTranscriptionDefaults, parseTranscriptionDefaults, validTranscriptionDefaults } from "../src/settings/transcription-defaults.js";

test("transcription defaults always parse to a complete state", () => {
  assert.deepEqual(emptyTranscriptionDefaults(), {
    providerId: "",
    modelId: "",
  });
  assert.deepEqual(parseTranscriptionDefaults("{}"), {
    providerId: "",
    modelId: "",
  });
  assert.deepEqual(
    parseTranscriptionDefaults(
      JSON.stringify({ providerId: "muse", modelId: "muse-voice" }),
    ),
    { providerId: "muse", modelId: "muse-voice" },
  );
});

test("transcription defaults drop unknown providers and malformed models", () => {
  for (const value of [null, 42, [], "{not json"]) {
    assert.deepEqual(parseTranscriptionDefaults(value), {
      providerId: "",
      modelId: "",
    });
  }

  assert.deepEqual(
    parseTranscriptionDefaults(
      JSON.stringify({ providerId: "invented", modelId: "muse-voice" }),
    ),
    { providerId: "", modelId: "muse-voice" },
  );

  assert.deepEqual(
    parseTranscriptionDefaults(
      JSON.stringify({ providerId: "muse", modelId: "--flag" }),
    ),
    { providerId: "muse", modelId: "" },
  );
  assert.deepEqual(
    parseTranscriptionDefaults(
      JSON.stringify({ providerId: "muse", modelId: "" }),
    ),
    { providerId: "muse", modelId: "" },
  );
});

test("transcription defaults reject invalid preference payloads", () => {
  assert.equal(
    validTranscriptionDefaults({ providerId: "muse", modelId: "muse-voice" }),
    true,
  );
  assert.equal(validTranscriptionDefaults(emptyTranscriptionDefaults()), true);
  assert.equal(
    validTranscriptionDefaults({ providerId: "", modelId: "muse-voice" }),
    true,
  );

  for (const value of [
    null,
    {},
    { providerId: "muse" },
    { modelId: "muse-voice" },
    { providerId: "invented", modelId: "muse-voice" },
    { providerId: "muse", modelId: "--flag" },
    { providerId: "muse", modelId: 42 },
    { providerId: ["muse"], modelId: "muse-voice" },
  ]) {
    assert.equal(validTranscriptionDefaults(value), false);
  }
});
