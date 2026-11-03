import { memo } from "react";
import type { ChatMessage as Message, CollabDelivery, CollabEvent, CollabParticipant, CollabTask } from "@veykor/shared";
import { ChatMessageList } from "@astryxdesign/core/Chat";
import { ThinkingMessage } from "./thinking-message";
import { ConversationMessage } from "./conversation-message";
import { CollabTimelineEvent } from "./collab-timeline-event";

const MemoizedConversationMessage = memo(ConversationMessage);

interface Timeline {
  events: CollabEvent[];
  tasks: CollabTask[];
  deliveries: CollabDelivery[];
  participants: CollabParticipant[];
  onOpenDelegate: (conversationId: string) => void;
}

interface Props {
  messages: Message[];
  isRunning: boolean;
  timeline?: Timeline;
}

function targetFor(
  event: CollabEvent,
  tasks: CollabTask[],
  participants: CollabParticipant[],
): string {
  const task = tasks.find((entry) => entry.id === event.taskId);

  if (task) {
    return task.conversationId;
  }

  const participant = participants.find(
    (entry) => entry.id === event.participantId,
  );

  if (participant && participant.role === "delegate") {
    return participant.conversationId;
  }

  return "";
}

export function ConversationMessages(props: Props) {
  const timeline = props.timeline;
  const entries: (
    | { kind: "message"; createdAt: number; message: Message; index: number }
    | { kind: "event"; createdAt: number; event: CollabEvent }
  )[] = props.messages.map((message, index) => ({
    kind: "message" as const,
    createdAt: message.createdAt || 0,
    message,
    index,
  }));

  if (timeline) {
    for (const event of timeline.events) {
      entries.push({ kind: "event", createdAt: event.createdAt, event });
    }

    entries.sort((left, right) => left.createdAt - right.createdAt);
  }

  return (
    <ChatMessageList className="mx-auto w-full max-w-4xl gap-6! px-4 py-6">
      {entries.map((entry) => {
        if (entry.kind === "event" && timeline) {
          const task =
            timeline.tasks.find((item) => item.id === entry.event.taskId) ||
            null;

          return (
            <CollabTimelineEvent
              key={`event-${entry.event.id}`}
              event={entry.event}
              task={task}
              deliveries={timeline.deliveries.filter(
                (delivery) => delivery.eventId === entry.event.id,
              )}
              targetConversationId={targetFor(
                entry.event,
                timeline.tasks,
                timeline.participants,
              )}
              onOpen={timeline.onOpenDelegate}
            />
          );
        }

        if (entry.kind === "message") {
          return (
            <MemoizedConversationMessage
              key={entry.message.id}
              message={entry.message}
              thinkingStartedAt={
                props.messages[entry.index - 1]?.createdAt || 0
              }
              isThinking={
                props.isRunning && entry.index === props.messages.length - 1
              }
            />
          );
        }

        return null;
      })}
      {props.isRunning && props.messages.at(-1)?.role === "user" ? (
        <ThinkingMessage
          isThinking
          startedAt={props.messages.at(-1)?.createdAt || 0}
        />
      ) : null}
    </ChatMessageList>
  );
}
