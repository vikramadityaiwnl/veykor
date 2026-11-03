import type { CollabParticipant, CollabTask } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStop } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";

interface Props {
  leadName: string;
  participants: CollabParticipant[];
  tasks: CollabTask[];
  selectedTab: string;
  statusByConversation: Record<string, string>;
  onOpen: (conversationId: string) => void;
  onStop: (taskId: string) => void;
}

function activeTask(tasks: CollabTask[], conversationId: string) {
  return tasks.find(
    (task) =>
      task.conversationId === conversationId &&
      task.state !== "completed" &&
      task.state !== "interrupted" &&
      task.state !== "failed" &&
      task.state !== "blocked",
  );
}

function stateLabel(
  task: CollabTask | undefined,
  tasks: CollabTask[],
  status: string,
): string {
  if (!task) {
    return status === "running" ? "working" : "idle";
  }

  if (task.interruptState === "requested") {
    return "stopping…";
  }

  switch (task.state) {
    case "queued": {
      if (task.waitingOn.length === 0) {
        return "queued";
      }

      const names = task.waitingOn.map(
        (id) =>
          tasks.find((entry) => entry.id === id)?.agentName || "another task",
      );

      return `Waiting for ${names.join(", ")}`;
    }
    case "running":
      return "running";
    case "waiting-for-approval":
      return "needs approval";
    case "waiting-for-reply":
      return "waiting for reply";
    case "completed":
      return "done";
    case "interrupted":
      return "stopped";
    case "failed":
      return "failed";
    case "blocked":
      return task.blockedBy ? `Blocked: ${task.blockedBy}` : "blocked";
  }
}

export function CollabParticipants(props: Props) {
  const delegates = props.participants.filter(
    (participant) => participant.role === "delegate",
  );

  if (delegates.length === 0) {
    return null;
  }

  return (
    <HStack
      gap={2}
      vAlign="center"
      wrap="wrap"
      className="mx-auto w-full max-w-4xl px-4"
      aria-label="Collaboration participants"
    >
      <Text className="text-(--color-text-secondary)">{props.leadName}</Text>

      {delegates.map((participant) => {
        const stoppable = activeTask(props.tasks, participant.conversationId);
        const task =
          stoppable ||
          props.tasks.find(
            (entry) =>
              entry.conversationId === participant.conversationId &&
              entry.state === "blocked",
          );
        const label = stateLabel(
          task,
          props.tasks,
          props.statusByConversation[participant.conversationId] || "",
        );

        return (
          <HStack
            key={participant.id}
            gap={1}
            vAlign="center"
            className="rounded-full border border-solid border-(--color-border) bg-(--color-background-surface) py-1 pr-1 pl-3"
          >
            <Button
              label={`${participant.agentName} — ${label}`}
              size="sm"
              variant="ghost"
              clickAction={() => props.onOpen(participant.conversationId)}
            />

            {stoppable && (
              <Button
                label={`Stop ${participant.agentName}`}
                size="sm"
                variant="ghost"
                isIconOnly
                icon={<FontAwesomeIcon icon={faStop} />}
                clickAction={() => props.onStop(stoppable.id)}
              />
            )}
          </HStack>
        );
      })}
    </HStack>
  );
}
