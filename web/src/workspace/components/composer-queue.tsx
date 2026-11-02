import { useState } from "react";
import type { QueuedChatMessage } from "@veykor/shared";
import { Banner } from "@astryxdesign/core/Banner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ComposerQueueMessage } from "./composer-queue-message";

interface Props {
  sessionId: string;
  messages: QueuedChatMessage[];
  paused: boolean;
}

export function ComposerQueue(props: Props) {
  const [error, setError] = useState("");

  return (
    <VStack
      gap={0}
      className="relative z-0 mx-1 -mb-4 min-w-0 rounded-t-(--radius-chat) border-x border-t border-solid border-(--color-border) bg-(--color-neutral) px-4 pt-3 pb-7 text-(--color-text-secondary) md:mx-4"
      role="region"
      aria-label="Queued messages"
    >
      <Text type="supporting" color="secondary">
        Queued messages{props.paused ? " · Paused" : ""}
      </Text>
      <VStack
        gap={0}
        className="max-h-48 min-w-0 overflow-y-auto"
        role="list"
        aria-label="Message queue"
      >
        {props.messages.map((message, index) => (
          <ComposerQueueMessage
            key={message.id}
            sessionId={props.sessionId}
            message={message}
            index={index}
            onError={setError}
          />
        ))}
      </VStack>
      {error && <Banner status="error" title={error} />}
    </VStack>
  );
}
