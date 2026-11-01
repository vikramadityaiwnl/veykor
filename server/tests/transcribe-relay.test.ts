import { test } from "node:test";
import assert from "node:assert/strict";
import { closeMessage, handshakeFrame, mapServerEvent } from "../src/transcribe/protocol.js";

test("transcription handshake carries the credential and the fixed model", () => {
  assert.deepEqual(JSON.parse(handshakeFrame("secret-key")), {
    authorization: { accessToken: "Bearer secret-key" },
    audioEncoding: "PCM_24KHZ",
    model: "muse-voice-transcribe-1.0",
    mode: "ENDPOINTING",
    emitAudioProgress: false,
  });
});

test("transcription maps partials, turn finals, and errors", () => {
  assert.deepEqual(
    mapServerEvent({
      type: "transcript",
      transcript: "hello",
      final: false,
      audioProcessedMs: 800,
    }),
    { kind: "partial", text: "hello" },
  );
  assert.deepEqual(
    mapServerEvent({
      type: "speechComplete",
      turnId: 2,
      transcript: "hello there.",
      audioProcessedMs: 1600,
    }),
    { kind: "complete", text: "hello there.", turnId: 2 },
  );
  assert.deepEqual(
    mapServerEvent({ type: "error", message: "bad audio", sessionId: "s" }),
    { kind: "error", message: "bad audio" },
  );
  assert.deepEqual(mapServerEvent({ type: "error", sessionId: "s" }), {
    kind: "error",
    message: "Transcription failed. Please try again.",
  });
});

test("transcription ignores lifecycle, progress, and malformed events", () => {
  for (const raw of [
    null,
    42,
    "transcript",
    [],
    {},
    { type: "speechStart", turnId: 1, audioProcessedMs: 100 },
    { type: "speechEnd", turnId: 1, audioProcessedMs: 900 },
    { type: "audioProgress", audioProcessedMs: 900 },
    { type: "speaker", label: "A", audioProcessedMs: 900 },
    { type: "future-event", transcript: "x" },
    { type: "transcript", transcript: 42 },
    { type: "transcript" },
    { type: "speechComplete", transcript: "x" },
    { type: "speechComplete", turnId: "1", transcript: "x" },
  ]) {
    assert.deepEqual(mapServerEvent(raw), { kind: "ignore" });
  }
});

test("transcription close codes map to user-facing messages", () => {
  assert.equal(closeMessage(1000, ""), undefined);
  assert.equal(
    closeMessage(1013, ""),
    "Transcription is rate limited. Please wait and try again.",
  );
  assert.equal(
    closeMessage(1011, "Max session duration reached"),
    "The transcription session reached its time limit. Please start again.",
  );
  assert.equal(
    closeMessage(1011, ""),
    "Transcription failed. Please try again.",
  );
  assert.equal(
    closeMessage(1008, ""),
    "Transcription rejected the audio stream. Please try again.",
  );
  assert.equal(closeMessage(4000, "custom"), "custom");
  assert.equal(
    closeMessage(4000, ""),
    "Transcription ended unexpectedly. Please try again.",
  );
});
