import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCube, faMicrophone, faPaperclip } from "@fortawesome/free-solid-svg-icons";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { ChatComposer, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";

interface SentMessage {
  id: number;
  text: string;
}

export function ProjectHomePage() {
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const nextId = useRef(1);

  function submit(value: string) {
    const text = value.trim();

    if (!text) {
      return;
    }

    const id = nextId.current++;

    setMessages((prev) => [...prev, { id, text }]);
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
