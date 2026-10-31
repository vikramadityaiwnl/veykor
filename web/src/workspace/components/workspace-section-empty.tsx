import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInbox } from "@fortawesome/free-solid-svg-icons";
import { EmptyState } from "@astryxdesign/core/EmptyState";

export function WorkspaceSectionEmpty() {
  return (
    <EmptyState
      className="h-24 py-0 [&_h3]:!text-(--color-text-secondary)"
      icon={
        <FontAwesomeIcon
          icon={faInbox}
          size="sm"
          className="text-(--color-icon-secondary)"
          aria-hidden="true"
        />
      }
      title="Nothing here"
      isCompact
    />
  );
}
