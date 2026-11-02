import type { ChatSessionsResponse } from "@veykor/shared";

interface Options {
  isReady: () => boolean;
  subscribe: (listener: () => void) => () => void;
  createSource: (cursor: string) => EventSource;
  receive: (payload: ChatSessionsResponse) => void;
}

interface Cursor {
  bootId: string;
  seq: number;
}

const eventSourceClosed = 2;

function parseCursor(value: string | undefined): Cursor | undefined {
  if (!value) {
    return undefined;
  }

  const separator = value.lastIndexOf(":");

  if (separator < 1) {
    return undefined;
  }

  const seq = Number(value.slice(separator + 1));

  if (!Number.isSafeInteger(seq) || seq < 0) {
    return undefined;
  }

  return { bootId: value.slice(0, separator), seq };
}

function isNewerCursor(last: Cursor | undefined, next: Cursor): boolean {
  if (!last || last.bootId !== next.bootId) {
    return true;
  }

  return next.seq > last.seq;
}

export function watchChatSnapshots(options: Options): () => void {
  let source: EventSource | undefined;
  let disposed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastCursor: Cursor | undefined;
  let lastCursorValue = "";

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function scheduleReconnect() {
    if (disposed || timer !== undefined || !options.isReady()) {
      return;
    }

    const delay = Math.min(1000 * 2 ** attempt, 10_000);
    attempt += 1;
    timer = setTimeout(() => {
      timer = undefined;
      connect();
    }, delay);
  }

  function connect() {
    if (disposed || source || !options.isReady()) {
      return;
    }

    const connection = options.createSource(lastCursorValue);
    source = connection;
    connection.addEventListener("snapshot", (event) => {
      if (disposed || source !== connection || !options.isReady()) {
        return;
      }

      attempt = 0;
      const payload = JSON.parse(
        (event as MessageEvent<string>).data,
      ) as ChatSessionsResponse;
      const cursor = parseCursor(payload.cursor);

      if (cursor) {
        if (!isNewerCursor(lastCursor, cursor)) {
          return;
        }

        lastCursor = cursor;
        lastCursorValue = payload.cursor || "";
      }

      options.receive(payload);
    });
    connection.addEventListener("error", () => {
      if (disposed || source !== connection) {
        return;
      }

      if (connection.readyState === eventSourceClosed) {
        source = undefined;
        scheduleReconnect();
      }
    });
  }

  function synchronize() {
    if (!options.isReady()) {
      clearTimer();
      source?.close();
      source = undefined;
      attempt = 0;
      return;
    }

    connect();
  }

  const unsubscribe = options.subscribe(synchronize);
  synchronize();

  return () => {
    disposed = true;
    unsubscribe();
    clearTimer();
    source?.close();
    source = undefined;
  };
}
