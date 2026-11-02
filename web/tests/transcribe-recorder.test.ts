import { test } from "node:test";
import assert from "node:assert/strict";
import type { SettingsProvider, TranscriptionProvider } from "@veykor/shared";
import { appendTranscript, floatToPcm16, resolveTranscriptionSelection } from "../src/workspace/transcribe-recorder";

function settingsProvider(id: string, available: boolean): SettingsProvider {
  return {
    id: id as SettingsProvider["id"],
    cli: id,
    name: id,
    label: id,
    company: id,
    installed: available,
    version: "",
    available,
    error: "",
    source: "",
    models: [],
  };
}

function catalogProvider(id: string, models: string[]): TranscriptionProvider {
  return {
    id: id as TranscriptionProvider["id"],
    name: id,
    available: true,
    error: "",
    source: "",
    models: models.map((model) => ({
      id: model,
      name: model,
      description: "",
    })),
  };
}

test("transcript text joins onto the draft with single spacing", () => {
  assert.equal(appendTranscript("", "hello"), "hello");
  assert.equal(appendTranscript("hello", ""), "hello");
  assert.equal(appendTranscript("", ""), "");
  assert.equal(appendTranscript("hello", "there"), "hello there");
  assert.equal(appendTranscript("hello ", "there"), "hello there");
});

test("pcm conversion quantizes, clamps, and resamples", () => {
  assert.deepEqual(
    Array.from(floatToPcm16(new Float32Array([0, 0, 0]), 24000)),
    [0, 0, 0],
  );
  assert.deepEqual(
    Array.from(floatToPcm16(new Float32Array([0.5, -0.5, 1, -1]), 24000)),
    [16384, -16384, 32767, -32768],
  );
  assert.deepEqual(
    Array.from(floatToPcm16(new Float32Array([2, -2]), 24000)),
    [32767, -32768],
  );
  assert.deepEqual(
    Array.from(floatToPcm16(new Float32Array([0, 0.5, 1, 1]), 4, 2)),
    [0, 32767],
  );
  assert.equal(floatToPcm16(new Float32Array(4800), 48000).length, 2400);
  assert.equal(floatToPcm16(new Float32Array(0), 48000).length, 0);
});

test("transcription selection keeps saved values and falls back cleanly", () => {
  const catalog = [
    catalogProvider("muse", ["muse-voice-transcribe-1.0"]),
    catalogProvider("codex", []),
  ];
  const providers = [
    settingsProvider("muse", true),
    settingsProvider("codex", true),
  ];

  assert.deepEqual(
    resolveTranscriptionSelection(
      catalog,
      providers,
      "muse",
      "muse-voice-transcribe-1.0",
    ),
    { providerId: "muse", modelId: "muse-voice-transcribe-1.0" },
  );
  assert.deepEqual(resolveTranscriptionSelection(catalog, providers, "", ""), {
    providerId: "muse",
    modelId: "muse-voice-transcribe-1.0",
  });
  assert.deepEqual(
    resolveTranscriptionSelection(catalog, providers, "muse", "retired"),
    { providerId: "muse", modelId: "muse-voice-transcribe-1.0" },
  );
  assert.deepEqual(
    resolveTranscriptionSelection(catalog, providers, "codex", ""),
    { providerId: "codex", modelId: "" },
  );
  assert.deepEqual(
    resolveTranscriptionSelection(
      catalog,
      [settingsProvider("muse", false)],
      "muse",
      "muse-voice-transcribe-1.0",
    ),
    { providerId: "", modelId: "" },
  );
  assert.deepEqual(resolveTranscriptionSelection([], [], "", ""), {
    providerId: "",
    modelId: "",
  });
});
