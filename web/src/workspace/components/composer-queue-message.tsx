import { useState } from "react";
import type { QueuedChatMessage } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowTurnUp, faCheck, faPen, faTrashCan, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { queueAction } from "../queue-actions";

interface Props {
  sessionId: string;
  message: QueuedChatMessage;
  index: number;
  onError: (error: string) => void;
}

export function ComposerQueueMessage(props: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(props.message.text);
  const [busy, setBusy] = useState(false);

  async function act(action: "steer" | "edit" | "delete") {
    setBusy(true);
    props.onError("");

    try {
      await queueAction(props.sessionId, props.message.id, action, text.trim());
      setEditing(false);
    } catch (error) {
      props.onError(
        error instanceof Error ? error.message : "Unable to update message",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <HStack
      gap={2}
      vAlign="center"
      className="min-w-0 border-b border-solid border-(--color-border) py-2 last:border-b-0"
      role="listitem"
    >
      <VStack gap={1} className="min-w-0 flex-1">
        {editing ? (
          <TextArea
            label={`Edit queued message ${props.index + 1}`}
            isLabelHidden
            value={text}
            onChange={setText}
            rows={2}
            size="sm"
            maxLength={100000}
            hasAutoFocus
            isDisabled={busy}
          />
        ) : (
          <Text maxLines={2} type="supporting" color="inherit">
            {props.message.text}
          </Text>
        )}
        {props.message.attachmentCount > 0 && (
          <Text type="supporting" color="secondary">
            {props.message.attachmentCount} image
            {props.message.attachmentCount === 1 ? "" : "s"}
          </Text>
        )}
        {props.message.error && (
          <Text type="supporting" color="secondary">
            {props.message.error}
          </Text>
        )}
      </VStack>
      <HStack gap={0} className="shrink-0">
        {editing ? (
          <>
            <Button
              label={`Save queued message ${props.index + 1}`}
              size="sm"
              variant="ghost"
              isIconOnly
              className="min-h-0! p-1!"
              isDisabled={busy || !text.trim()}
              icon={<FontAwesomeIcon icon={faCheck} />}
              clickAction={() => void act("edit")}
            />
            <Button
              label="Cancel editing queued message"
              size="sm"
              variant="ghost"
              isIconOnly
              className="min-h-0! p-1!"
              isDisabled={busy}
              icon={<FontAwesomeIcon icon={faXmark} />}
              clickAction={() => setEditing(false)}
            />
          </>
        ) : (
          <>
            <Button
              label={`Steer queued message ${props.index + 1}`}
              size="sm"
              variant="ghost"
              isIconOnly
              className="min-h-0! p-1!"
              isDisabled={busy}
              icon={<FontAwesomeIcon icon={faArrowTurnUp} />}
              clickAction={() => void act("steer")}
            />
            <Button
              label={`Edit queued message ${props.index + 1}`}
              size="sm"
              variant="ghost"
              isIconOnly
              className="min-h-0! p-1!"
              isDisabled={busy}
              icon={<FontAwesomeIcon icon={faPen} />}
              clickAction={() => {
                setText(props.message.text);
                setEditing(true);
              }}
            />
            <Button
              label={`Delete queued message ${props.index + 1}`}
              size="sm"
              variant="ghost"
              isIconOnly
              className="min-h-0! p-1!"
              isDisabled={busy}
              icon={<FontAwesomeIcon icon={faTrashCan} />}
              clickAction={() => void act("delete")}
            />
          </>
        )}
      </HStack>
    </HStack>
  );
}
