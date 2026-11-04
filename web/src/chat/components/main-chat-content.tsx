import { useWorkStore } from "../../work/work-store.ts";
import ProjectGreeting from "../../work/components/project-greeting.tsx";
import ProjectNotFound from "../../work/components/project-not-found.tsx";
import MemoryReceipt from "../../memory/components/memory-receipt.tsx";
import { useEffect } from "react";
import { usePreferencesStore } from "../../workspace/preferences-store.ts";
import { useChatStore } from "../chat-store.ts";
import ChatComposer from "./chat-composer.tsx";
import ChatNotFound from "./chat-not-found.tsx";
import GreetingHeader from "./greeting-header.tsx";
import MessageList from "./message-list.tsx";
import LoadingSpinner from "../../components/loading-spinner/loading-spinner.tsx";

function MainChatContent() {
  const projectId = useWorkStore((state) => state.projectId);
  const workLoaded = useWorkStore((state) => state.loaded);
  const projects = useWorkStore((state) => state.projects);
  const projectMissing =
    projectId !== "" &&
    workLoaded &&
    projects.every((project) => project.id !== projectId);
  const activeChatId = useChatStore((state) => state.activeChatId);
  const draftSeq = useChatStore((state) => state.draftSeq);
  const items = useChatStore((state) => state.items);
  const recentQuestions = useChatStore((state) => state.recentQuestions);
  const historyLoading = useChatStore((state) => state.historyLoading);
  const chatNotFound = useChatStore((state) => state.chatNotFound);
  const streaming = useChatStore((state) => state.streaming);
  const streamingStartedAt = useChatStore((state) => state.streamingStartedAt);
  const streamingTurnId = useChatStore((state) => state.streamingTurnId);
  const sentAttachments = useChatStore((state) => state.sentAttachments);
  const thinkingSnapshots = useChatStore((state) => state.thinkingSnapshots);
  const turnDurations = useChatStore((state) => state.turnDurations);
  const error = useChatStore((state) => state.error);
  const memoryReceipts = useChatStore((state) => state.memoryReceipts);
  const dismissMemoryReceipt = useChatStore(
    (state) => state.dismissMemoryReceipt,
  );
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

  useEffect(() => {
    if (error !== "") {
      console.log(error);
    }
  }, [error]);

  const imageUrls =
    activeChatId === null ? [] : (sentAttachments[activeChatId] ?? []);

  if (projectMissing) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ProjectNotFound />
      </div>
    );
  }

  if (chatNotFound && activeChatId !== null) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ChatNotFound />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!activeChatId && !streaming && items.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6">
          {projectId ? <ProjectGreeting /> : <GreetingHeader key={draftSeq} />}
        </div>
      ) : historyLoading ? (
        <div className="grid flex-1 place-items-center text-zinc-500">
          <LoadingSpinner />
        </div>
      ) : (
        <MessageList
          imageUrls={imageUrls}
          items={items}
          questions={recentQuestions}
          streaming={streaming}
          streamingTurnId={streamingTurnId}
          thinkingSnapshots={thinkingSnapshots}
          turnDurations={turnDurations}
          streamingStartedAt={streamingStartedAt}
        />
      )}

      {memoryReceipts.length > 0 && (
        <div className="mx-auto w-full max-w-3xl space-y-2 px-4 pb-2">
          {memoryReceipts.map((receipt) => (
            <MemoryReceipt
              key={receipt.memoryId}
              onDismiss={dismissMemoryReceipt}
              receipt={receipt}
            />
          ))}
        </div>
      )}

      <ChatComposer key={projectId} />
    </div>
  );
}

export default MainChatContent;
