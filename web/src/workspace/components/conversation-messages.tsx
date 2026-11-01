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
  const dates = props.messages.map((message) =>
    message.createdAt > 0 ? dateFormat.format(message.createdAt) : "",
  );

  return (
    <ChatMessageList className="mx-auto w-full max-w-4xl gap-6! px-4 py-6">
      {props.messages.map((message, index) => {
        const date = dates[index];
        const previousDate = dates.slice(0, index).filter(Boolean).at(-1) || "";
        const showDate = date !== "" && date !== previousDate;

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
