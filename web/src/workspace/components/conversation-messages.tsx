import { Fragment } from "react";
import type { ChatMessage as Message } from "@veykor/shared";
import { ChatMessageList, ChatSystemMessage } from "@astryxdesign/core/Chat";
import { ConversationMessage } from "./conversation-message";

interface Props {
  messages: Message[];
  isRunning: boolean;
}

export function ConversationMessages(props: Props) {
  const dateFormat = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  let previousDate = "";

  return (
    <ChatMessageList className="mx-auto w-full max-w-4xl gap-6! px-4 py-6">
      {props.messages.map((message, index) => {
        const date =
          message.createdAt > 0 ? dateFormat.format(message.createdAt) : "";
        const showDate = date !== "" && date !== previousDate;
        previousDate = date || previousDate;

        return (
          <Fragment key={message.id}>
            {showDate ? (
              <ChatSystemMessage variant="divider">{date}</ChatSystemMessage>
            ) : null}
            <ConversationMessage
              message={message}
              isThinking={
                props.isRunning && index === props.messages.length - 1
              }
            />
          </Fragment>
        );
      })}
    </ChatMessageList>
  );
}
