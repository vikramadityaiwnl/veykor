import { memo } from "react";
import type { ChatMessage as Message } from "@veykor/shared";
import { ChatMessageList } from "@astryxdesign/core/Chat";
import { ThinkingMessage } from "./thinking-message";
import { ConversationMessage } from "./conversation-message";

const MemoizedConversationMessage = memo(ConversationMessage);

interface Props {
  messages: Message[];
  isRunning: boolean;
}

export function ConversationMessages(props: Props) {
  return (
    <ChatMessageList className="mx-auto w-full max-w-4xl gap-6! px-4 py-6">
      {props.messages.map((message, index) => (
        <MemoizedConversationMessage
          key={message.id}
          message={message}
          thinkingStartedAt={props.messages[index - 1]?.createdAt || 0}
          isThinking={props.isRunning && index === props.messages.length - 1}
        />
      ))}
      {props.isRunning && props.messages.at(-1)?.role === "user" ? (
        <ThinkingMessage
          isThinking
          startedAt={props.messages.at(-1)?.createdAt || 0}
        />
      ) : null}
    </ChatMessageList>
  );
}
