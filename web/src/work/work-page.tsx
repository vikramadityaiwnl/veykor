import { useEffect } from "react";
import { usePreferencesStore } from "../workspace/preferences-store.ts";
import { useWorkStore } from "./work-store.ts";
import ChatComposer from "../chat/components/chat-composer.tsx";
import Logo from "../components/logo/logo.tsx";
import { useChatStore } from "../chat/chat-store.ts";

function WorkPage() {
  const loaded = usePreferencesStore((state) => state.loaded);

  useEffect(() => {
    if (loaded && usePreferencesStore.getState().lastTab !== "work") {
      usePreferencesStore.getState().setLastTab("work");
    }

    useWorkStore.getState().selectProject("");
    if (useChatStore.getState().activeChatId !== null) {
      useChatStore.getState().startDraft("recent");
    }
  }, [loaded]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid flex-1 place-items-center px-6">
        <div className="space-y-4 text-center">
          <div className="flex justify-center opacity-40">
            <Logo size={96} />
          </div>
          <h1 className="text-xl font-semibold">Make room for your work</h1>
          <p className="text-sm font-light text-zinc-400">
            Choose a project or add a folder to start working.
          </p>
        </div>
      </div>
      <ChatComposer workMode />
    </div>
  );
}

export default WorkPage;
