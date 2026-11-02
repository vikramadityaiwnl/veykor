import { test } from "node:test";
import assert from "node:assert/strict";
import { watchChatSnapshots } from "../src/workspace/chat-live-connection";

class Source extends EventTarget {
  closed = false;
  close() {
    this.closed = true;
  }
  snapshot() {
    this.dispatchEvent(
      new MessageEvent("snapshot", { data: JSON.stringify({ sessions: [] }) }),
    );
  }
}

test("live snapshots connect when mounted after sessions are already ready and reconnect after hot replacement", () => {
  const sources: Source[] = [];
  const listeners = new Set<() => void>();
  let received = 0;
  const options = {
    isReady: () => true,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    createSource: () => {
      const source = new Source();
      sources.push(source);
      return source as unknown as EventSource;
    },
    receive: () => {
      received += 1;
    },
  };
  const first = watchChatSnapshots(options);
  assert.equal(sources.length, 1);
  sources[0].snapshot();
  assert.equal(received, 1);
  for (const listener of listeners) {
    listener();
  }
  assert.equal(sources.length, 1);
  first();
  assert.equal(sources[0].closed, true);
  const second = watchChatSnapshots(options);
  assert.equal(sources.length, 2);
  sources[0].snapshot();
  sources[1].snapshot();
  assert.equal(received, 2);
  second();
  assert.equal(listeners.size, 0);
});

test("live snapshots close on logout, ignore old account events, and start when ready again", () => {
  let ready = false;
  let listener = () => {};
  const sources: Source[] = [];
  let received = 0;
  const stop = watchChatSnapshots({
    isReady: () => ready,
    subscribe: (callback) => {
      listener = callback;
      return () => {};
    },
    createSource: () => {
      const source = new Source();
      sources.push(source);
      return source as unknown as EventSource;
    },
    receive: () => {
      received += 1;
    },
  });
  assert.equal(sources.length, 0);
  ready = true;
  listener();
  sources[0].snapshot();
  ready = false;
  listener();
  assert.equal(sources[0].closed, true);
  sources[0].snapshot();
  ready = true;
  listener();
  sources[0].snapshot();
  sources[1].snapshot();
  assert.equal(received, 2);
  stop();
});
