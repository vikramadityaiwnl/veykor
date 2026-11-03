import { useEffect, useRef } from "react";
import type { ChatHistoryItem } from "@veykor/shared";
import AgentMessage from "./agent-message.tsx";
import ThinkingBlock from "./thinking-block.tsx";
import ToolCallBlock from "./tool-call-block.tsx";
import UserMessage from "./user-message.tsx";

interface Props {
  items: ChatHistoryItem[];
  streaming: boolean;
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

  function renderItem(item: ChatHistoryItem) {
    if (item.kind === "userMessage") {
      return <UserMessage item={item} key={item.itemId} />;
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

        {props.streaming && (
          <div aria-hidden="true" className="flex items-center gap-1.5 px-1">
            <span className="size-1.5 animate-bounce rounded-full bg-zinc-500 motion-reduce:animate-none" />

            <span className="size-1.5 animate-bounce rounded-full bg-zinc-500 motion-reduce:animate-none [animation-delay:150ms]" />

            <span className="size-1.5 animate-bounce rounded-full bg-zinc-500 motion-reduce:animate-none [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageList;
