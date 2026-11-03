import { useState } from "react";
import type { CollabDelivery, CollabEvent, CollabTask } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  event: CollabEvent;
  task: CollabTask | null;
  deliveries: CollabDelivery[];
  targetConversationId: string;
  onOpen: (conversationId: string) => void;
}

function liveLabel(props: Props): string {
  if (props.event.type === "task-delegated" && props.task) {
    const state =
      props.task.state === "interrupted"
        ? "stopped"
        : props.task.state === "waiting-for-approval"
          ? "needs approval"
          : props.task.state === "waiting-for-reply"
            ? "waiting for reply"
            : props.task.state;

    return `${props.event.title.split(" — ")[0]} — ${state}`;
  }

  return props.event.title;
}

export function CollabTimelineEvent(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const target = props.targetConversationId;
  const time = new Date(props.event.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <VStack
      gap={1}
      className="w-full rounded-(--radius-element) border border-solid border-(--color-border) bg-(--color-background-surface) px-3 py-2"
    >
      <HStack gap={2} vAlign="center" className="min-w-0">
        <Button
          label={expanded ? "Collapse event" : "Expand event"}
          size="sm"
          variant="ghost"
          isIconOnly
          icon={
            <FontAwesomeIcon icon={expanded ? faChevronDown : faChevronRight} />
          }
          clickAction={() => setExpanded(!expanded)}
        />

        {target ? (
          <Button
            label={liveLabel(props)}
            size="sm"
            variant="ghost"
            clickAction={() => props.onOpen(target)}
          />
        ) : (
          <Text className="min-w-0 flex-1 truncate text-left">
            {liveLabel(props)}
          </Text>
        )}

        <Text className="ml-auto shrink-0 text-(--color-text-secondary)">
          {time}
        </Text>
      </HStack>

      {expanded && (
        <VStack gap={1} className="min-w-0 px-1 pb-1">
          {props.event.body && (
            <Text className="whitespace-pre-wrap wrap-anywhere text-(--color-text-secondary)">
              {props.event.body}
            </Text>
          )}

          {props.task?.resultPreview && (
            <Text className="whitespace-pre-wrap wrap-anywhere text-(--color-text-secondary)">
              {props.task.resultIncomplete ? "Partial result: " : "Result: "}
              {props.task.resultPreview}
            </Text>
          )}

          {props.deliveries.length > 0 && (
            <Text className="text-(--color-text-secondary)">
              {props.deliveries
                .map(
                  (delivery) =>
                    `${delivery.participantName || "session"} ${delivery.state}`,
                )
                .join(" · ")}
            </Text>
          )}
        </VStack>
      )}
    </VStack>
  );
}
