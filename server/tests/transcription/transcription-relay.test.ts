import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  RelayCloseListener,
  RelayMessageListener,
  RelaySocket,
} from "../../src/transcription/transcription-relay.js";
import {
  relaySocketOpen,
  startTranscriptionRelay,
} from "../../src/transcription/transcription-relay.js";

type AnyListener = (...args: Array<never>) => void;

class FakeSocket implements RelaySocket {
  readyState = relaySocketOpen;

  sent: Array<string | Buffer> = [];

  closedWith: number | null = null;

  private listeners = new Map<string, Array<AnyListener>>();

  on(event: "open", listener: () => void): unknown;
  on(event: "message", listener: RelayMessageListener): unknown;
  on(event: "close", listener: RelayCloseListener): unknown;
  on(event: "error", listener: () => void): unknown;
  on(event: string, listener: AnyListener): unknown {
    const kept = this.listeners.get(event) ?? [];

    kept.push(listener);
    this.listeners.set(event, kept);

    return undefined;
  }

  send(data: string | Buffer): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closedWith = code ?? 1005;
    this.readyState = 3;
  }

  emitMessage(data: unknown, isBinary: boolean): void {
    for (const listener of this.listeners.get("message") ?? []) {
      (listener as RelayMessageListener)(data, isBinary);
    }
  }

  emitOpen(): void {
    for (const listener of this.listeners.get("open") ?? []) {
      (listener as () => void)();
    }
  }

  emitClose(code: number): void {
    this.readyState = 3;

    for (const listener of this.listeners.get("close") ?? []) {
      (listener as RelayCloseListener)(code);
    }
  }
}

function sentText(socket: FakeSocket): Array<string> {
  return socket.sent.filter(
    (entry): entry is string => typeof entry === "string",
  );
}

function sentBinary(socket: FakeSocket): Array<Buffer> {
  return socket.sent.filter((entry): entry is Buffer => Buffer.isBuffer(entry));
}

function startRelay(): { downstream: FakeSocket; upstream: FakeSocket } {
  const downstream = new FakeSocket();
  const upstream = new FakeSocket();

  upstream.readyState = 0;

  startTranscriptionRelay({
    downstream,
    upstream,
    apiKey: "test-key",
    model: "muse-voice-transcribe-1.0",
    handshakeTimeoutMs: 50,
  });

  return { downstream, upstream };
}

test("relay sends the handshake once the upstream opens", () => {
  const { upstream } = startRelay();

  assert.equal(sentText(upstream).length, 0);

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();

  assert.equal(sentText(upstream).length, 1);

  const handshake = JSON.parse(sentText(upstream)[0]) as Record<
    string,
    unknown
  >;

  assert.deepEqual(handshake, {
    authorization: { accessToken: "Bearer test-key" },
    audioEncoding: "PCM_24KHZ",
    model: "muse-voice-transcribe-1.0",
    mode: "PUSH_TO_TALK",
    partialMode: "CUMULATIVE",
    emitAudioProgress: false,
  });

  upstream.emitOpen();

  assert.equal(sentText(upstream).length, 1);
});

test("relay announces readiness and flushes queued audio after the ack", () => {
  const { downstream, upstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();

  downstream.emitMessage(Buffer.from([1, 2, 3]), true);
  downstream.emitMessage(Buffer.from([4, 5]), true);

  assert.equal(sentBinary(upstream).length, 0);

  upstream.emitMessage(JSON.stringify({ sessionId: "mock-1" }), false);

  assert.deepEqual(JSON.parse(sentText(downstream)[0]), {
    type: "ready",
    sessionId: "mock-1",
  });
  assert.deepEqual(
    sentBinary(upstream).map((chunk) => Array.from(chunk)),
    [
      [1, 2, 3],
      [4, 5],
    ],
  );

  downstream.emitMessage(Buffer.from([6]), true);

  assert.equal(sentBinary(upstream).length, 3);
});

test("relay forwards partial and final transcripts", () => {
  const { downstream, upstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();
  upstream.emitMessage(JSON.stringify({ sessionId: "mock-1" }), false);

  upstream.emitMessage(
    JSON.stringify({ type: "transcript", transcript: "hel", final: false }),
    false,
  );
  upstream.emitMessage(
    JSON.stringify({ type: "transcript", transcript: "Hello.", final: true }),
    false,
  );
  upstream.emitMessage(
    JSON.stringify({ type: "audioProgress", audioProcessedMs: 10 }),
    false,
  );

  assert.deepEqual(
    sentText(downstream).map((raw) => JSON.parse(raw)),
    [
      { type: "ready", sessionId: "mock-1" },
      { type: "transcript", text: "hel", final: false },
      { type: "transcript", text: "Hello.", final: true },
    ],
  );
});

test("relay ends the upstream stream once and ignores other text", () => {
  const { downstream, upstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();
  upstream.emitMessage(JSON.stringify({ sessionId: "mock-1" }), false);

  downstream.emitMessage(JSON.stringify({ type: "unknown" }), false);
  downstream.emitMessage("not-json", false);
  downstream.emitMessage(JSON.stringify({ type: "end" }), false);
  downstream.emitMessage(JSON.stringify({ type: "end" }), false);

  const endFrames = sentText(upstream).filter(
    (raw) => raw === JSON.stringify({ type: "endStream" }),
  );

  assert.equal(endFrames.length, 1);
});

test("relay holds the end marker until the ack arrives", () => {
  const { downstream, upstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();

  downstream.emitMessage(JSON.stringify({ type: "end" }), false);

  assert.equal(sentText(upstream).length, 1);

  upstream.emitMessage(JSON.stringify({ sessionId: "mock-1" }), false);

  assert.deepEqual(sentText(upstream).slice(1), [
    JSON.stringify({ type: "endStream" }),
  ]);
});

test("relay surfaces upstream errors and closes both sockets", () => {
  const { downstream, upstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();
  upstream.emitMessage(JSON.stringify({ sessionId: "mock-1" }), false);

  upstream.emitMessage(
    JSON.stringify({ type: "error", message: "bad key", sessionId: "s" }),
    false,
  );

  assert.deepEqual(JSON.parse(sentText(downstream).at(-1) as string), {
    type: "error",
    message: "bad key",
  });
  assert.equal(downstream.closedWith, 1011);
  assert.equal(upstream.closedWith, 1000);

  upstream.emitClose(1008);

  assert.equal(sentText(downstream).length, 2);
});

test("relay closes cleanly on upstream completion", () => {
  const { downstream, upstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();
  upstream.emitMessage(JSON.stringify({ sessionId: "mock-1" }), false);

  upstream.emitClose(1000);

  assert.equal(downstream.closedWith, 1000);
  assert.deepEqual(
    sentText(downstream).map((raw) => JSON.parse(raw)),
    [{ type: "ready", sessionId: "mock-1" }],
  );
});

test("relay reports abnormal upstream closes once", () => {
  const { downstream, upstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();
  upstream.emitMessage(JSON.stringify({ sessionId: "mock-1" }), false);

  upstream.emitClose(1013);

  const last = JSON.parse(sentText(downstream).at(-1) as string) as {
    type: string;
    message: string;
  };

  assert.equal(last.type, "error");
  assert.match(last.message, /busy/);
  assert.equal(downstream.closedWith, 1011);
});

test("relay fails when the handshake acknowledgement never arrives", async () => {
  const { downstream, upstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();

  await new Promise((resolve) => setTimeout(resolve, 120));

  const last = JSON.parse(sentText(downstream).at(-1) as string) as {
    type: string;
  };

  assert.equal(last.type, "error");
  assert.equal(downstream.closedWith, 1011);
  assert.equal(upstream.closedWith, 1000);
});

test("relay decodes text frames delivered as buffers", () => {
  const { downstream, upstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();
  upstream.emitMessage(
    Buffer.from(JSON.stringify({ sessionId: "mock-1" }), "utf8"),
    false,
  );

  assert.deepEqual(JSON.parse(sentText(downstream)[0]), {
    type: "ready",
    sessionId: "mock-1",
  });

  upstream.emitMessage(
    Buffer.from(
      JSON.stringify({ type: "transcript", transcript: "Hi", final: true }),
      "utf8",
    ),
    false,
  );

  assert.deepEqual(JSON.parse(sentText(downstream)[1]), {
    type: "transcript",
    text: "Hi",
    final: true,
  });

  downstream.emitMessage(
    Buffer.from(JSON.stringify({ type: "end" }), "utf8"),
    false,
  );

  assert.deepEqual(sentText(upstream).slice(1), [
    JSON.stringify({ type: "endStream" }),
  ]);
});

test("relay releases the upstream when the browser disconnects", () => {
  const { upstream, downstream } = startRelay();

  upstream.readyState = relaySocketOpen;
  upstream.emitOpen();

  downstream.emitClose(1005);

  assert.equal(upstream.closedWith, 1000);
  assert.equal(sentText(downstream).length, 0);
});
