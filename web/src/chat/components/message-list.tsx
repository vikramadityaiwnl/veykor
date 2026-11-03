import { useEffect, useRef } from "react";
import type { ChatHistoryItem } from "@veykor/shared";
import AgentMessage from "./agent-message.tsx";
import ThinkingBlock from "./thinking-block.tsx";
import ToolCallBlock from "./tool-call-block.tsx";
import UserMessage from "./user-message.tsx";

interface Props {
  imageUrls: Array<string>;
  items: Array<ChatHistoryItem>;
  streaming: boolean;
  streamingTurnId: string;
}

function allocateImages(
  items: Array<ChatHistoryItem>,
  imageUrls: Array<string>,
): Map<string, Array<string>> {
  const assigned = new Map<string, Array<string>>();

  let cursor = 0;

  for (const item of items) {
    if (item.kind !== "userMessage" || item.attachments.length === 0) {
      continue;
    }

    assigned.set(
      item.itemId,
      imageUrls.slice(cursor, cursor + item.attachments.length),
    );

    cursor += item.attachments.length;
  }

  return assigned;
}

function MessageList(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    if (distanceFromBottom < 120 || props.streaming) {
      container.scrollTop = container.scrollHeight;
    }
  }, [props.items, props.streaming]);

  const hasTurnContent =
    props.streamingTurnId !== "" &&
    props.items.some(
      (item) =>
        item.turnId === props.streamingTurnId &&
        (item.kind === "agentMessage" ||
          item.kind === "reasoning" ||
          item.kind === "toolCall"),
    );

  const showPending = props.streaming && !hasTurnContent;

  const imageByItem = allocateImages(props.items, props.imageUrls);

  function renderItem(item: ChatHistoryItem) {
    if (item.kind === "userMessage") {
      return (
        <UserMessage
          images={imageByItem.get(item.itemId) ?? []}
          item={item}
          key={item.itemId}
        />
      );
    }

    if (item.kind === "agentMessage") {
      return <AgentMessage item={item} key={item.itemId} />;
    }

    if (item.kind === "reasoning") {
      if (item.summary.length === 0 && item.status === "completed") {
        return null;
      }

      return <ThinkingBlock item={item} key={item.itemId} />;
    }

    if (item.kind === "toolCall") {
      return <ToolCallBlock item={item} key={item.itemId} />;
    }

    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto" ref={containerRef}>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        {props.items.map((item) => renderItem(item))}

        {showPending ? (
          <p
            aria-hidden="true"
            className="animate-shimmer w-fit px-1 text-sm font-light"
          >
            Thinking…
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default MessageList;
