import type { ChatMessage as Message } from "@veykor/shared";
import { ChatMessage, ChatMessageBubble } from "@astryxdesign/core/Chat";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MessageMetadata } from "./message-metadata";
import { ThinkingMessage } from "./thinking-message";
import { ConversationAttachment } from "./conversation-attachment";
import { openInNewTab } from "../chat-attachments";

interface Props {
  message: Message;
  isThinking: boolean;
  thinkingStartedAt?: number;
}

export function ConversationMessage(props: Props) {
  const attachments = props.message.attachments ?? [];

  return (
    <ChatMessage sender={props.message.role} className="group/message min-w-0">
      <ChatMessageBubble
        metadata={
          props.message.text ? (
            <MessageMetadata
              text={props.message.text}
              createdAt={props.message.createdAt}
            />
          ) : undefined
        }
        variant={props.message.role === "assistant" ? "ghost" : "filled"}
        width={props.message.role === "assistant" ? "100%" : undefined}
      >
        <VStack gap={3} className="min-w-0">
          {attachments.length > 0 && (
            <HStack gap={2} wrap="wrap" className="min-w-0">
              {attachments.map((attachment) => (
                <ConversationAttachment
                  key={attachment.id}
                  attachment={attachment}
                  onOpen={() => openInNewTab(attachment.dataUrl)}
                />
              ))}
            </HStack>
          )}

          {props.message.role === "assistant" &&
          (props.message.tools.length > 0 ||
            props.message.thinkingStartedAt ||
            props.message.thinking ||
            (props.isThinking && !props.message.text)) ? (
            <ThinkingMessage
              text={props.message.thinking || ""}
              entries={props.message.thoughtEntries || []}
              tools={props.message.tools}
              startedAt={
                props.message.thinkingStartedAt || props.thinkingStartedAt || 0
              }
              seconds={props.message.thinkingSeconds || 0}
              isThinking={props.isThinking && !props.message.text}
            />
          ) : null}

          {props.message.text ? (
            props.message.role === "assistant" ? (
              <Markdown className="min-w-0 wrap-anywhere">
                {props.message.text}
              </Markdown>
            ) : (
              <Text className="whitespace-pre-wrap wrap-anywhere">
                {props.message.text}
              </Text>
            )
          ) : null}
        </VStack>
      </ChatMessageBubble>
    </ChatMessage>
  );
}
