import type { ChatAttachment } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  attachment: ChatAttachment;
  onOpen: () => void;
  onRemove: () => void;
}

export function ComposerAttachment(props: Props) {
  if (!props.attachment.dataUrl) {
    return null;
  }

  return (
    <VStack gap={0} className="relative w-44 shrink-0">
      <HStack justify="end" className="absolute right-1 top-1 z-10">
        <Button
          label={`Remove ${props.attachment.name}`}
          size="sm"
          variant="secondary"
          isIconOnly
          className="h-6! w-6! p-0! hover:bg-(--color-background-red)! hover:text-(--color-text-red)!"
          icon={<FontAwesomeIcon icon={faXmark} />}
          clickAction={props.onRemove}
        />
      </HStack>

      <button
        type="button"
        aria-label={`Open ${props.attachment.name} in a new tab`}
        onClick={props.onOpen}
        className="min-w-0 cursor-pointer rounded-(--radius-element) border border-solid border-(--color-border-emphasized) bg-(--color-background-raised) text-left"
      >
        <img
          src={props.attachment.dataUrl}
          alt={props.attachment.name}
          className="h-24 w-full rounded-(--radius-element) object-cover"
        />
      </button>
    </VStack>
  );
}
