import type { ChatSessionsResponse } from "@veykor/shared";

interface Options {
  isReady: () => boolean;
  subscribe: (listener: () => void) => () => void;
  createSource: () => EventSource;
  receive: (payload: ChatSessionsResponse) => void;
}

export function watchChatSnapshots(options: Options): () => void {
  let source: EventSource | undefined;
  let disposed = false;

  function synchronize() {
    if (!options.isReady()) {
      source?.close();
      source = undefined;
      return;
    }
    if (source) {
      return;
    }

    const connection = options.createSource();
    source = connection;
    connection.addEventListener("snapshot", (event) => {
      if (disposed || source !== connection || !options.isReady()) {
        return;
      }
      options.receive(
        JSON.parse(
          (event as MessageEvent<string>).data,
        ) as ChatSessionsResponse,
      );
    });
  }

  const unsubscribe = options.subscribe(synchronize);
  synchronize();

  return () => {
    disposed = true;
    unsubscribe();
    source?.close();
    source = undefined;
  };
}
