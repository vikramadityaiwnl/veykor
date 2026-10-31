import { useOutletContext } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCube, faMicrophone, faPaperclip } from "@fortawesome/free-solid-svg-icons";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { ChatComposer, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { useChatSessionsStore, type SessionMessage } from "./chat-sessions-store";
import type { WorkspaceOutletContext } from "./workspace-layout";
import { useSidebarSectionsStore } from "./sidebar-sections-store";

const noMessages: SessionMessage[] = [];

export function ProjectHomePage() {
  const project = useOutletContext<WorkspaceOutletContext>().project;
  const activeSessionId = useChatSessionsStore(
    (state) => state.activeSessionId,
  );
  const messages = useChatSessionsStore((state) =>
    activeSessionId
      ? (state.messages[activeSessionId] ?? noMessages)
      : noMessages,
  );
  const addMessage = useChatSessionsStore((state) => state.addMessage);
  const ensureChatSession = useChatSessionsStore(
    (state) => state.ensureChatSession,
  );
  const ensureProjectSession = useChatSessionsStore(
    (state) => state.ensureProjectSession,
  );
  const defaultChatsSectionId = useSidebarSectionsStore(
    (state) =>
      state.sections.find((section) => section.isFixed)?.id ??
      state.sections.find((section) => section.kind === "chats")?.id ??
      null,
  );

  function submit(value: string) {
    const text = value.trim();

    if (!text) {
      return;
    }

    if (activeSessionId) {
      addMessage(activeSessionId, text);
      return;
    }

    if (project) {
      const session = ensureProjectSession(project.id);

      addMessage(session.id, text);
      return;
    }

    if (!defaultChatsSectionId) {
      return;
    }

    const session = ensureChatSession(defaultChatsSectionId);

    addMessage(session.id, text);
  }

  return (
    <ChatLayout
      className="min-h-0 flex-1"
      scrollButton={null}
      emptyState={
        <Center>
          <img
            className="size-[calc(var(--spacing-12)*2)] object-contain dark:invert"
            src="/logo.svg"
            alt=""
          />
        </Center>
      }
      composer={
        <VStack gap={2} className="mx-auto w-full max-w-4xl px-4">
          <ChatComposer
            onSubmit={submit}
            placeholder="Describe what you'd like to build..."
            elevation="none"
            footerActions={
              <HStack gap={1} vAlign="center">
                <Button
                  label="Attach a file"
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  icon={
                    <FontAwesomeIcon icon={faPaperclip} aria-hidden="true" />
                  }
                />
                <Button
                  label="Default model"
                  variant="ghost"
                  size="sm"
                  icon={<FontAwesomeIcon icon={faCube} aria-hidden="true" />}
                  endContent={
                    <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
                  }
                />
              </HStack>
            }
            sendActions={
              <Button
                label="Use microphone"
                isIconOnly
                variant="ghost"
                icon={
                  <FontAwesomeIcon icon={faMicrophone} aria-hidden="true" />
                }
              />
            }
          />
        </VStack>
      }
    >
      {messages.length > 0 ? (
        <ChatMessageList>
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              sender="user"
              avatar={<Avatar name="You" size="md" />}
            >
              <ChatMessageBubble name="You">{message.text}</ChatMessageBubble>
            </ChatMessage>
          ))}
        </ChatMessageList>
      ) : null}
    </ChatLayout>
  );
}
