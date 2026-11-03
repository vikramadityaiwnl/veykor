import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultTranscriptionModel,
  defaultTranscriptionRealtimeUrl,
  loadTranscriptionConfig,
  transcriptionRealtimeUrlWithSession,
} from "../../src/transcription/transcription-config.js";
import {
  buildRealtimeHandshake,
  metaCloseMessage,
  metaEndStreamMessage,
  parseMetaServerEvent,
} from "../../src/transcription/meta-realtime.js";
import {
  isAllowedTranscriptionOrigin,
  isTranscriptionUpgradePath,
} from "../../src/transcription/transcription-upgrade.js";
import { sessionTokenFromCookieHeader } from "../../src/auth/auth.js";

test("transcription config defaults to the Meta realtime endpoint", () => {
  const config = loadTranscriptionConfig({});

  assert.equal(config.apiKey, "");
  assert.equal(config.model, defaultTranscriptionModel);
  assert.equal(config.model, "muse-voice-transcribe-1.0");
  assert.equal(config.realtimeUrl, defaultTranscriptionRealtimeUrl);
  assert.equal(config.realtimeUrl, "wss://api.meta.ai/v1/asr/realtime");
});

test("transcription config honors overrides and trims blanks", () => {
  const config = loadTranscriptionConfig({
    MODEL_API_KEY: "  secret  ",
    ASR_MODEL: "  custom-model  ",
    ASR_REALTIME_URL: "  wss://relay.example/asr  ",
  });

  assert.equal(config.apiKey, "secret");
  assert.equal(config.model, "custom-model");
  assert.equal(config.realtimeUrl, "wss://relay.example/asr");

  const blanked = loadTranscriptionConfig({
    MODEL_API_KEY: "   ",
    ASR_MODEL: "   ",
    ASR_REALTIME_URL: "   ",
  });

  assert.equal(blanked.apiKey, "");
  assert.equal(blanked.model, defaultTranscriptionModel);
  assert.equal(blanked.realtimeUrl, defaultTranscriptionRealtimeUrl);
});

test("realtime session urls join with the right separator", () => {
  assert.equal(
    transcriptionRealtimeUrlWithSession(
      "wss://api.meta.ai/v1/asr/realtime",
      "a b",
    ),
    "wss://api.meta.ai/v1/asr/realtime?sessionId=a%20b",
  );
  assert.equal(
    transcriptionRealtimeUrlWithSession("wss://relay.example/asr?x=1", "s"),
    "wss://relay.example/asr?x=1&sessionId=s",
  );
});

test("realtime handshake carries the bearer key and push-to-talk mode", () => {
  assert.deepEqual(
    buildRealtimeHandshake("secret", "muse-voice-transcribe-1.0"),
    {
      authorization: {
        accessToken: "Bearer secret",
      },
      audioEncoding: "PCM_24KHZ",
      model: "muse-voice-transcribe-1.0",
      mode: "PUSH_TO_TALK",
      partialMode: "CUMULATIVE",
      emitAudioProgress: false,
    },
  );

  assert.equal(metaEndStreamMessage(), JSON.stringify({ type: "endStream" }));
});

test("meta server events parse acks, transcripts, and errors", () => {
  assert.deepEqual(parseMetaServerEvent(JSON.stringify({ sessionId: "s1" })), {
    kind: "ack",
    sessionId: "s1",
  });

  assert.deepEqual(
    parseMetaServerEvent(
      JSON.stringify({ type: "transcript", transcript: "hel", final: false }),
    ),
    { kind: "transcript", text: "hel", final: false },
  );

  assert.deepEqual(
    parseMetaServerEvent(
      JSON.stringify({ type: "transcript", transcript: "Hello.", final: true }),
    ),
    { kind: "transcript", text: "Hello.", final: true },
  );

  assert.deepEqual(
    parseMetaServerEvent(
      JSON.stringify({ type: "error", message: "bad key", sessionId: "s1" }),
    ),
    { kind: "error", message: "bad key", sessionId: "s1" },
  );
});

test("meta server events ignore lifecycle chatter and malformed frames", () => {
  const ignored = [
    JSON.stringify({ type: "speechStart", turnId: 1, audioProcessedMs: 5 }),
    JSON.stringify({ type: "speechEnd", turnId: 1, audioProcessedMs: 9 }),
    JSON.stringify({
      type: "speechComplete",
      turnId: 1,
      transcript: "Hi",
      audioProcessedMs: 9,
    }),
    JSON.stringify({ type: "speaker", label: "A", audioProcessedMs: 7 }),
    JSON.stringify({ type: "audioProgress", audioProcessedMs: 11 }),
    JSON.stringify({ type: "future-event", payload: 1 }),
    JSON.stringify({ sessionId: "" }),
    JSON.stringify({}),
    JSON.stringify(["transcript"]),
    JSON.stringify("transcript"),
    "{not-json",
    "",
  ];

  for (const raw of ignored) {
    assert.deepEqual(parseMetaServerEvent(raw), { kind: "ignore" });
  }

  assert.deepEqual(
    parseMetaServerEvent(JSON.stringify({ type: "error", sessionId: "s" })),
    {
      kind: "error",
      message: "The transcription service failed.",
      sessionId: "s",
    },
  );
});

test("meta close codes map to retry guidance", () => {
  assert.match(metaCloseMessage(1008), /rejected/);
  assert.match(metaCloseMessage(1011), /problem/);
  assert.match(metaCloseMessage(1013), /busy/);
  assert.match(metaCloseMessage(1006), /unexpectedly/);
});

test("transcription upgrade paths match the stream route only", () => {
  assert.equal(isTranscriptionUpgradePath("/api/transcription/stream"), true);
  assert.equal(
    isTranscriptionUpgradePath("/api/transcription/stream?x=1"),
    true,
  );
  assert.equal(isTranscriptionUpgradePath("/api/transcription"), false);
  assert.equal(isTranscriptionUpgradePath("/api/chats"), false);
  assert.equal(isTranscriptionUpgradePath(undefined), false);
  assert.equal(isTranscriptionUpgradePath(""), false);
});

test("transcription origins must match the request host", () => {
  assert.equal(isAllowedTranscriptionOrigin(undefined, "a:1"), true);
  assert.equal(isAllowedTranscriptionOrigin("", "a:1"), true);
  assert.equal(
    isAllowedTranscriptionOrigin("http://localhost:5173", "localhost:5173"),
    true,
  );
  assert.equal(
    isAllowedTranscriptionOrigin("http://192.168.1.5:5173", "192.168.1.5:5173"),
    true,
  );
  assert.equal(
    isAllowedTranscriptionOrigin("http://evil.example", "localhost:5173"),
    false,
  );
  assert.equal(
    isAllowedTranscriptionOrigin("http://localhost:5173", "localhost:3001"),
    false,
  );
  assert.equal(isAllowedTranscriptionOrigin("not-a-url", "a:1"), false);
  assert.equal(
    isAllowedTranscriptionOrigin("http://localhost:5173", undefined),
    false,
  );
});

test("session cookies parse the session token", () => {
  assert.equal(sessionTokenFromCookieHeader(undefined), "");
  assert.equal(sessionTokenFromCookieHeader(""), "");
  assert.equal(sessionTokenFromCookieHeader("other=1"), "");
  assert.equal(
    sessionTokenFromCookieHeader("other=1; veykor_session=abc123; x=2"),
    "abc123",
  );
  assert.equal(sessionTokenFromCookieHeader("veykor_session=only"), "only");
});
