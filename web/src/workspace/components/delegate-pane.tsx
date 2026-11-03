import type { CollabParticipant, CollabTask } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { DelegateTab } from "./delegate-tab";

interface Props {
  tabs: string[];
  selected: string;
  participants: CollabParticipant[];
  tasks: CollabTask[];
  onSelect: (conversationId: string) => void;
  onClose: (conversationId: string) => void;
  onBack: () => void;
}

function nameFor(participants: CollabParticipant[], conversationId: string) {
  return (
    participants.find((entry) => entry.conversationId === conversationId)
      ?.agentName || "Delegate"
  );
}

export function DelegatePane(props: Props) {
  return (
    <VStack gap={0} className="h-full min-h-0 min-w-0">
      <HStack
        gap={1}
        vAlign="center"
        className="min-w-0 shrink-0 overflow-x-auto border-b border-solid border-(--color-border) px-2 py-2"
      >
        <Button
          label="Back to main chat"
          size="sm"
          variant="ghost"
          className="shrink-0 md:hidden"
          icon={<FontAwesomeIcon icon={faArrowLeft} />}
          clickAction={props.onBack}
        />

        {props.tabs.map((tab) => (
          <HStack
            key={tab}
            gap={0}
            vAlign="center"
            className={
              tab === props.selected
                ? "shrink-0 rounded-(--radius-element) bg-(--color-background-surface)"
                : "shrink-0"
            }
          >
            <Button
              label={nameFor(props.participants, tab)}
              size="sm"
              variant={tab === props.selected ? "secondary" : "ghost"}
              clickAction={() => props.onSelect(tab)}
            />

            <Button
              label={`Close ${nameFor(props.participants, tab)}`}
              size="sm"
              variant="ghost"
              isIconOnly
              icon={<FontAwesomeIcon icon={faXmark} />}
              clickAction={() => props.onClose(tab)}
            />
          </HStack>
        ))}
      </HStack>

      {props.tabs.map((tab) => (
        <DelegateTab
          key={tab}
          conversationId={tab}
          visible={tab === props.selected}
          participants={props.participants}
          tasks={props.tasks}
        />
      ))}
    </VStack>
  );
}
