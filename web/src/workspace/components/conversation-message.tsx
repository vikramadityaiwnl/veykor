import { useState } from "react";
import type { ChatMessage as Message } from "@veykor/shared";
import { ChatMessage, ChatMessageBubble, ChatToolCalls } from "@astryxdesign/core/Chat";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MessageMetadata } from "./message-metadata";
import { ThinkingMessage } from "./thinking-message";
import { ConversationAttachment } from "./conversation-attachment";
import { DocumentLightbox } from "./document-lightbox";

interface Props {
  message: Message;
  isThinking: boolean;
}

export function ConversationMessage(props: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const attachments = props.message.attachments ?? [];
  const preview = attachments.find((entry) => entry.id === previewId) ?? null;

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
                  onPreview={() => setPreviewId(attachment.id)}
                />
              ))}
            </HStack>
          )}

          {props.message.tools.length > 0 ? (
            <ChatToolCalls
              calls={props.message.tools.map((tool) => ({
                key: tool.id,
                name: tool.name,
                target: tool.target,
                status: tool.status,
                errorMessage: tool.errorMessage,
                resultDetail: tool.result ? (
                  <Text
                    type="code"
                    className="whitespace-pre-wrap wrap-anywhere"
                  >
                    {tool.result}
                  </Text>
                ) : undefined,
              }))}
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
          ) : props.isThinking ? (
            <ThinkingMessage />
          ) : null}
        </VStack>
      </ChatMessageBubble>

      <DocumentLightbox
        attachment={preview}
        onClose={() => setPreviewId(null)}
      />
    </ChatMessage>
  );
}
