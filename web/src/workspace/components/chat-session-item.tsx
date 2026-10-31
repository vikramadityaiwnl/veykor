import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment } from "@fortawesome/free-solid-svg-icons";
import { ContextMenu } from "@astryxdesign/core/ContextMenu";
import { SideNavItem } from "@astryxdesign/core/SideNav";
import type { ChatSession } from "../chat-sessions-store";
import { chatMenuItems } from "../chat-menu-items";

interface Props {
  session: ChatSession;
  isSelected: boolean;
  size?: "sm" | "md";
  onSelect: (id: string) => void;
  onRename: (session: ChatSession) => void;
  onDelete: (session: ChatSession) => void;
}

export function ChatSessionItem(props: Props) {
  return (
    <ContextMenu
      label={`${props.session.title} actions`}
      onContextMenu={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      items={chatMenuItems(
        () => props.onRename(props.session),
        () => props.onDelete(props.session),
      )}
    >
      <SideNavItem
        label={props.session.title}
        size={props.size}
        icon={<FontAwesomeIcon icon={faComment} size="sm" aria-hidden="true" />}
        isSelected={props.isSelected}
        onClick={() => props.onSelect(props.session.id)}
      />
    </ContextMenu>
  );
}
