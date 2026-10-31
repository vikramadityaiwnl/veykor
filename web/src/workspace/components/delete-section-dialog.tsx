import { useState } from "react";
import type { SidebarSection } from "@veykor/shared";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";

interface Props {
  section: SidebarSection | null;
  projectCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}

export function DeleteSectionDialog(props: Props) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (props.section === null) {
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
      title={`Delete "${props.section.title}"?`}
      description={
        props.projectCount === 0
          ? "This section will be removed from your sidebar. This cannot be undone."
          : `This section and its ${props.projectCount} ${props.projectCount === 1 ? "project" : "projects"} will be permanently removed. This cannot be undone.`
      }
      actionLabel="Delete"
      isActionLoading={isDeleting}
      onAction={confirm}
    />
  );
}
