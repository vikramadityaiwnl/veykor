import type { ChatAttachment } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile, faFileExcel, faFileLines, faFilePdf } from "@fortawesome/free-solid-svg-icons";
import { Center } from "@astryxdesign/core/Center";

interface Props {
  attachment: ChatAttachment;
  onOpen: () => void;
}

export function ConversationAttachment(props: Props) {
  const icon =
    props.attachment.kind === "pdf"
      ? faFilePdf
      : props.attachment.kind === "spreadsheet"
        ? faFileExcel
        : props.attachment.kind === "text"
          ? faFileLines
          : faFile;

  if (!props.attachment.dataUrl) {
    return (
      <Center className="shrink-0 rounded-(--radius-element) border border-solid border-(--color-border-emphasized) bg-(--color-background-raised) p-1">
        <Center className="h-16 w-16">
          <FontAwesomeIcon
            icon={icon}
            size="lg"
            className="text-(--color-icon-secondary)"
          />
        </Center>
      </Center>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onOpen}
      aria-label={`Open ${props.attachment.name} in a new tab`}
      className="shrink-0 cursor-pointer rounded-(--radius-element) border border-solid border-(--color-border-emphasized) bg-(--color-background-raised) p-1"
    >
      {props.attachment.kind === "image" ? (
        <img
          src={props.attachment.dataUrl}
          alt=""
          className="h-16 w-16 rounded-(--radius-element) object-cover"
        />
      ) : (
        <Center className="h-16 w-16">
          <FontAwesomeIcon
            icon={icon}
            size="lg"
            className="text-(--color-icon-secondary)"
          />
        </Center>
      )}
    </button>
  );
}
