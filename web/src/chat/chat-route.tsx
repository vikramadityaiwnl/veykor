import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { subscribeChat } from "./chat-client.ts";
import ChatScreen from "./chat-screen.tsx";
import { useChatStore } from "./chat-store.ts";

function ChatRoute() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const pendingRoutePush = useChatStore((state) => state.pendingRoutePush);

  useEffect(() => {
    const state = useChatStore.getState();

    if (chatId === undefined) {
      if (state.pendingRoutePush !== null) {
        state.clearRoutePush();
        navigate(`/chat/${encodeURIComponent(state.pendingRoutePush)}`, {
          replace: true,
        });
      } else if (state.activeChatId !== null) {
        state.startDraft(state.pendingSectionId);
      }
    } else if (state.activeChatId !== chatId) {
      void state.openChat(chatId);
    }
  }, [chatId, navigate, pendingRoutePush]);

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
