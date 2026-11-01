import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileLines, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  name: string;
  text: string;
  preview: string;
  size: number;
  onRemove: () => void;
}

export function ComposerAttachment(props: Props) {
  return (
    <VStack
      gap={2}
      className="relative w-44 shrink-0 overflow-hidden rounded-(--radius-element) border border-solid border-(--color-border) bg-(--color-background-body) p-2"
    >
      <HStack justify="end" className="absolute right-1 top-1">
        <Button
          label={`Remove ${props.name}`}
          size="sm"
          variant="secondary"
          isIconOnly
          icon={<FontAwesomeIcon icon={faXmark} />}
          clickAction={props.onRemove}
        />
      </HStack>
      {props.preview ? (
        <img
          src={props.preview}
          alt={props.name}
          className="h-24 w-full rounded-(--radius-element) object-cover"
        />
      ) : (
        <VStack gap={2} className="h-24 overflow-hidden p-2">
          <FontAwesomeIcon
            icon={faFileLines}
            className="self-start text-(--color-icon-secondary)"
          />
          <Text type="supporting" color="secondary" maxLines={3}>
            {props.text.slice(0, 180) || "Empty document"}
          </Text>
        </VStack>
      )}
      <Text maxLines={1} type="supporting" weight="semibold">
        {props.name}
      </Text>
      <Text type="supporting" color="secondary">
        {Math.max(1, Math.round(props.size / 1000))} KB
        {props.preview ? " · Preview only" : " · Text file"}
      </Text>
    </VStack>
  );
}
