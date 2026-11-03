import { useState } from "react";
import type { Project } from "@veykor/shared";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";

interface Props {
  project: Project | null;
  chatCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}

export function DeleteProjectChatsDialog(props: Props) {
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
      title={`Delete all chat in "${props.project.name}"?`}
      description={
        props.chatCount === 1
          ? "The 1 chat in this project will be permanently removed. The project itself will stay. This cannot be undone."
          : `All ${props.chatCount} chats in this project will be permanently removed. The project itself will stay. This cannot be undone.`
      }
      actionLabel="Delete all"
      isActionLoading={isDeleting}
      onAction={confirm}
    />
  );
}
