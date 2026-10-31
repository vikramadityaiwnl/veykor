import { useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCube, faPaperclip, faPeopleGroup } from "@fortawesome/free-solid-svg-icons";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { ChatComposer, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList } from "@astryxdesign/core/Chat";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { WorkspaceOutletContext } from "./workspace-layout";
import { teamAgents } from "./workspace-data";
import logoDark from "../../../assets/logo-dark.png";
import logoLight from "../../../assets/logo-light.png";
import { useThemeStore } from "../theme-store";

interface DummyMessage {
  id: number;
  sender: "user" | "assistant";
  text: string;
}

export function ProjectHomePage() {
  const { project } = useOutletContext<WorkspaceOutletContext>();
  const mode = useThemeStore((state) => state.mode);

  const [messages, setMessages] = useState<DummyMessage[]>([]);
  const nextId = useRef(1);

  const title = project
    ? `What should we build in ${project.name}?`
    : "What should we build today?";

  const caption = project
    ? "Your team shares this project's memory."
    : "This conversation lives outside any project.";

  function submit(value: string) {
    const text = value.trim();

    if (!text) {
      return;
    }

    const userId = nextId.current++;
    const replyId = nextId.current++;

    setMessages((prev) => [
      ...prev,
      { id: userId, sender: "user", text },
      {
        id: replyId,
        sender: "assistant",
        text: "This is a dummy preview. Agent replies will appear here once projects are wired up.",
      },
    ]);
  }

  return (
    <ChatLayout
      className="min-h-0 flex-1"
      scrollButton={null}
      emptyState={
        <Center>
          <VStack gap={6} hAlign="center">
            <img
              className="size-(calc(var(--spacing-12)*2)) object-contain"
              src={mode === "dark" ? logoDark : logoLight}
              alt=""
            />

            <Heading level={1} weight="semibold" className="text-center">
              {title}
            </Heading>

            <HStack gap={4} vAlign="center" wrap="wrap" hAlign="center">
              {teamAgents.map((agent) => (
                <HStack key={agent.id} gap={2} vAlign="center">
                  <Avatar name={agent.name} size="sm" />
                  <Text>{agent.name}</Text>
                </HStack>
              ))}

              <Divider orientation="vertical" />

              <Button
                label="Edit team"
                variant="ghost"
                icon={
                  <FontAwesomeIcon icon={faPeopleGroup} aria-hidden="true" />
                }
              />
            </HStack>
          </VStack>
        </Center>
      }
      composer={
        <VStack gap={2}>
          <ChatComposer
            onSubmit={submit}
            placeholder="Describe what you'd like to build..."
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
          />

          <HStack hAlign="center">
            <Text type="supporting" color="secondary">
              {caption}
            </Text>
          </HStack>
        </VStack>
      }
    >
      {messages.length > 0 ? (
        <ChatMessageList>
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              sender={message.sender}
              avatar={
                <Avatar
                  name={message.sender === "user" ? "You" : "Lead"}
                  size="md"
                />
              }
            >
              <ChatMessageBubble
                name={message.sender === "user" ? "You" : "Lead"}
              >
                {message.text}
              </ChatMessageBubble>
            </ChatMessage>
          ))}
        </ChatMessageList>
      ) : null}
    </ChatLayout>
  );
}
