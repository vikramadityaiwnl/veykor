import type { ChatAttachment } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile, faFileExcel, faFileLines, faFilePdf, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  attachment: ChatAttachment;
  onPreview: () => void;
  onRemove: () => void;
}

export function ComposerAttachment(props: Props) {
  const icon =
    props.attachment.kind === "pdf"
      ? faFilePdf
      : props.attachment.kind === "spreadsheet"
        ? faFileExcel
        : props.attachment.kind === "text"
          ? faFileLines
          : faFile;

  const label =
    props.attachment.kind === "pdf"
      ? "PDF document"
      : props.attachment.kind === "spreadsheet"
        ? "Spreadsheet"
        : props.attachment.kind === "text"
          ? "Empty document"
          : props.attachment.kind === "video"
            ? "Video"
            : "Document";

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
        aria-label={`Preview ${props.attachment.name}`}
        onClick={props.onPreview}
        className="min-w-0 cursor-pointer rounded-(--radius-element) border border-solid border-(--color-border-emphasized) bg-(--color-background-raised) text-left"
      >
        {props.attachment.kind === "image" && props.attachment.dataUrl ? (
          <img
            src={props.attachment.dataUrl}
            alt={props.attachment.name}
            className="h-24 w-full rounded-(--radius-element) object-cover"
          />
        ) : (
          <VStack gap={2} className="h-24 overflow-hidden p-2">
            <FontAwesomeIcon
              icon={icon}
              className="self-start text-(--color-icon-secondary)"
            />

            <Text type="supporting" color="secondary" maxLines={3}>
              {props.attachment.kind === "text" && props.attachment.text
                ? props.attachment.text.slice(0, 180)
                : label}
            </Text>
          </VStack>
        )}
      </button>
    </VStack>
  );
}
