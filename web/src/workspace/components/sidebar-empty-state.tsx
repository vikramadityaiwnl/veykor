import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInbox, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";

interface Props {
  onCreateSection: () => void;
}

export function SidebarEmptyState(props: Props) {
  return (
    <EmptyState
      title="No sections yet"
      description="Right-click in the sidebar to create a new section."
      icon={
        <FontAwesomeIcon
          icon={faInbox}
          size="sm"
          className="text-(--color-icon-secondary)"
          aria-hidden="true"
        />
      }
      actions={
        <Button
          label="New section"
          icon={<FontAwesomeIcon icon={faPlus} aria-hidden="true" />}
          clickAction={props.onCreateSection}
        />
      }
      isCompact
    />
  );
}
