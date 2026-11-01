import type { ChatAttachment } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile, faFileExcel, faFileLines, faFilePdf } from "@fortawesome/free-solid-svg-icons";
import { Center } from "@astryxdesign/core/Center";

interface Props {
  attachment: ChatAttachment;
  onPreview: () => void;
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

  return (
    <button
      type="button"
      onClick={props.onPreview}
      aria-label={`Preview ${props.attachment.name}`}
      className="shrink-0 cursor-pointer rounded-(--radius-element) border border-solid border-(--color-border-emphasized) bg-(--color-background-raised) p-1"
    >
      {props.attachment.kind === "image" && props.attachment.dataUrl ? (
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
