import type { ChatMessage as Message } from "@veykor/shared";
import { Avatar } from "@astryxdesign/core/Avatar";
import { ChatMessage, ChatMessageBubble, ChatMessageList } from "@astryxdesign/core/Chat";

interface Props {
  messages: Message[];
}

export function ConversationMessages(props: Props) {
  return (
    <ChatMessageList>
      {props.messages.map((message) => (
        <ChatMessage
          key={message.id}
          sender={message.role}
          avatar={
            <Avatar
              name={message.role === "user" ? "You" : "Assistant"}
              size="md"
            />
          }
        >
          <ChatMessageBubble
            name={message.role === "user" ? "You" : "Assistant"}
            variant={message.role === "assistant" ? "ghost" : "filled"}
          >
            <pre className="m-0 whitespace-pre-wrap wrap-anywhere font-[inherit]">
              {message.text || "Thinking…"}
            </pre>
          </ChatMessageBubble>
        </ChatMessage>
      ))}
    </ChatMessageList>
  );
}
