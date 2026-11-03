import { useWorkStore } from "../work/work-store.ts";
import { usePreferencesStore } from "../workspace/preferences-store.ts";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { subscribeChat } from "./chat-client.ts";
import ChatScreen from "./chat-screen.tsx";
import { useChatStore } from "./chat-store.ts";

function ChatRoute() {
  const { chatId, projectId } = useParams();
  const navigate = useNavigate();
  const preferencesLoaded = usePreferencesStore((state) => state.loaded);
  const pendingRoutePush = useChatStore((state) => state.pendingRoutePush);

  useEffect(() => {
    const state = useChatStore.getState();
    const work = useWorkStore.getState();

    if (work.projectId !== (projectId ?? "")) {
      work.selectProject(projectId ?? "");
    }

    if (projectId) {
      if (usePreferencesStore.getState().lastTab !== "work") {
        usePreferencesStore.getState().setLastTab("work");
      }
      void work.load();
    }

    if (chatId === undefined) {
      if (state.pendingRoutePush !== null) {
        state.clearRoutePush();
        navigate(
          `${projectId ? `/work/${encodeURIComponent(projectId)}` : ""}/chat/${encodeURIComponent(state.pendingRoutePush)}`,
          {
            replace: true,
          },
        );
      } else if (state.activeChatId !== null) {
        state.startDraft(state.pendingSectionId);
      }
    } else if (state.activeChatId !== chatId) {
      void state.openChat(chatId);
    }
  }, [chatId, projectId, navigate, pendingRoutePush, preferencesLoaded]);

  useEffect(() => {
    if (chatId === undefined) {
      return;
    }

    return subscribeChat(chatId, (detail) => {
      useChatStore.getState().syncChat(detail);
    });
  }, [chatId]);

  return <ChatScreen />;
}

export default ChatRoute;
