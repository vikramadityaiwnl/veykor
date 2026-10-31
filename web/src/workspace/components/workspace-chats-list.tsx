import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment } from "@fortawesome/free-solid-svg-icons";
import { SideNavItem } from "@astryxdesign/core/SideNav";
import type { ChatSession } from "../chat-sessions-store";
import { WorkspaceSectionEmpty } from "./workspace-section-empty";

interface Props {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
}

export function WorkspaceChatsList(props: Props) {
  if (props.sessions.length === 0) {
    return <WorkspaceSectionEmpty />;
  }

  return (
    <>
      {props.sessions.map((session) => (
        <SideNavItem
          key={session.id}
          label={session.title}
          icon={
            <FontAwesomeIcon icon={faComment} size="sm" aria-hidden="true" />
          }
          isSelected={session.id === props.activeSessionId}
          onClick={() => {
            props.onSelectSession(session.id);
          }}
        />
      ))}
    </>
  );
}
