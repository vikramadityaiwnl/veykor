import { useState } from "react";
import type { ChatSession } from "../chat-sessions-store";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";

interface Props {
  session: ChatSession | null;
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}

export function DeleteChatDialog(props: Props) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (props.session === null) {
    return null;
  }

  async function confirm() {
    setIsDeleting(true);

    try {
      const deleted = await props.onConfirm();

      if (deleted) {
        props.onCancel();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          props.onCancel();
        }
      }}
      title="Delete chat?"
      description="This chat and its messages will be permanently removed. This cannot be undone."
      actionLabel="Delete"
      isActionLoading={isDeleting}
      onAction={confirm}
    />
  );
}
