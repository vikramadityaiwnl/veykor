import { useEffect } from "react";
import { usePreferencesStore } from "../workspace/preferences-store.ts";
import { useChatStore } from "./chat-store.ts";
import ChatComposer from "./components/chat-composer.tsx";
import GreetingHeader from "./components/greeting-header.tsx";
import MessageList from "./components/message-list.tsx";
import SessionLoader from "./components/session-loader.tsx";

function ChatScreen() {
  const activeChatId = useChatStore((state) => state.activeChatId);
  const draftSeq = useChatStore((state) => state.draftSeq);
  const items = useChatStore((state) => state.items);
  const historyLoading = useChatStore((state) => state.historyLoading);
  const streaming = useChatStore((state) => state.streaming);
  const streamingTurnId = useChatStore((state) => state.streamingTurnId);
  const sentAttachments = useChatStore((state) => state.sentAttachments);
  const error = useChatStore((state) => state.error);
  const clearError = useChatStore((state) => state.clearError);
  const loadCatalog = useChatStore((state) => state.loadCatalog);
  const syncDraftPreferences = useChatStore(
    (state) => state.syncDraftPreferences,
  );
  const prefsLoaded = usePreferencesStore((state) => state.loaded);

  useEffect(() => {
    void loadCatalog(activeChatId ?? undefined);
  }, [activeChatId, loadCatalog]);

  useEffect(() => {
    if (prefsLoaded && activeChatId === null) {
      syncDraftPreferences();
    }
  }, [prefsLoaded, activeChatId, syncDraftPreferences]);

  const imageUrls =
    activeChatId === null ? [] : (sentAttachments[activeChatId] ?? []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!activeChatId ? (
        <div className="grid flex-1 place-items-center px-6">
          <GreetingHeader key={draftSeq} />
        </div>
      ) : historyLoading ? (
        <div className="grid flex-1 place-items-center px-6">
          <SessionLoader />
        </div>
      ) : (
        <MessageList
          imageUrls={imageUrls}
          items={items}
          streaming={streaming}
          streamingTurnId={streamingTurnId}
        />
      )}

      {error !== "" && (
        <div
          className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pb-2"
          role="alert"
        >
          <p className="text-sm font-light text-rose-400">{error}</p>

          <button
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-light text-zinc-400 hover:text-zinc-200"
            onClick={clearError}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}

      <ChatComposer />
    </div>
  );
}

export default ChatScreen;
