import type { ChatThoughtEntry, ChatToolCall } from "@veykor/shared";
import { VStack } from "@astryxdesign/core/VStack";
import { ConversationToolCalls } from "./conversation-tool-calls";
import { useEffect, useState } from "react";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Text } from "@astryxdesign/core/Text";

interface Props {
  text?: string;
  entries?: ChatThoughtEntry[];
  tools?: ChatToolCall[];
  isThinking?: boolean;
  startedAt?: number;
  seconds?: number;
}

export function ThinkingMessage(props: Props) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!props.isThinking) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [props.isThinking]);

  const entries = props.entries || [];
  const tools = props.tools || [];
  const seconds = props.isThinking
    ? Math.max(0, Math.floor((now - (props.startedAt || now)) / 1000))
    : props.seconds || 0;
  const duration = `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const hasDetails = Boolean(
    props.text ||
    entries.some((entry) => entry.text || entry.kind === "tool") ||
    tools.length,
  );
  const label = props.isThinking
    ? `Thinking for ${duration}`
    : seconds
      ? `Thought for ${duration}`
      : "Thought";

  if (!props.isThinking && !hasDetails) {
    return seconds ? (
      <Text type="supporting">Responded in {duration}</Text>
    ) : null;
  }

  return (
    <Collapsible
      defaultIsOpen={false}
      chevronPosition="end"
      className="w-full min-w-0"
      trigger={
        <Text
          type="supporting"
          className={props.isThinking ? "chat-thinking" : ""}
        >
          {label}
        </Text>
      }
    >
      <VStack
        gap={4}
        className="min-w-0 border-l border-solid border-(--color-border-emphasized) pl-4 py-2"
      >
        {entries.length > 0 ? (
          entries.map((entry) => {
            const tool = tools.find(
              (candidate) => candidate.id === entry.toolId,
            );
            return entry.kind === "tool" ? (
              tool ? (
                <ConversationToolCalls key={entry.id} tools={[tool]} />
              ) : null
            ) : entry.text ? (
              <Text
                key={entry.id}
                type="supporting"
                display="block"
                className="whitespace-pre-wrap wrap-anywhere"
              >
                {entry.text}
              </Text>
            ) : null;
          })
        ) : (
          <>
            {props.text ? (
              <Text
                type="supporting"
                display="block"
                className="whitespace-pre-wrap wrap-anywhere"
              >
                {props.text}
              </Text>
            ) : null}
            {tools.length > 0 ? <ConversationToolCalls tools={tools} /> : null}
          </>
        )}
        {!props.text &&
        !entries.some((entry) => entry.text || entry.kind === "tool") &&
        !tools.length ? (
          <Text type="supporting">
            {props.isThinking
              ? "Muse has not sent any reasoning or tool activity yet."
              : "No reasoning summary available."}
          </Text>
        ) : null}
      </VStack>
    </Collapsible>
  );
}
