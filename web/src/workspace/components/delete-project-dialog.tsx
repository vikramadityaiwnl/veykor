import { useState } from "react";
import type { Project } from "@veykor/shared";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";

interface Props {
  project: Project | null;
  chatCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}

export function DeleteProjectDialog(props: Props) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (props.project === null) {
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
      title={`Delete "${props.project.name}"?`}
      description={
        props.chatCount === 0
          ? "This project will be removed from your list. Your files on disk will stay untouched. This cannot be undone."
          : `This project and its ${props.chatCount} ${props.chatCount === 1 ? "chat" : "chats"} will be permanently removed. Your files on disk will stay untouched. This cannot be undone.`
      }
      actionLabel="Delete"
      isActionLoading={isDeleting}
      onAction={confirm}
    />
  );
}
