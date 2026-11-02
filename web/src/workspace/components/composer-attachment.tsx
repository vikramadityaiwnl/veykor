import type { ChatAttachment } from "@veykor/shared";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";

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
    <Thumbnail
      src={props.attachment.dataUrl}
      label={props.attachment.name}
      onClick={props.onOpen}
      onRemove={props.onRemove}
      className="w-24!"
    />
  );
}
