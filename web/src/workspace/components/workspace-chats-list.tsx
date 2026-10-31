import type { ChatSession } from "../chat-sessions-store";
import { WorkspaceSectionEmpty } from "./workspace-section-empty";

import { ChatSessionItem } from "./chat-session-item";

interface Props {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onRenameSession: (session: ChatSession) => void;
  onDeleteSession: (session: ChatSession) => void;
  onSelectSession: (id: string) => void;
}

export function WorkspaceChatsList(props: Props) {
  if (props.sessions.length === 0) {
    return <WorkspaceSectionEmpty />;
  }

  return (
    <>
      {props.sessions.map((session) => (
        <ChatSessionItem
          key={session.id}
          session={session}
          isSelected={session.id === props.activeSessionId}
          onSelect={props.onSelectSession}
          onRename={props.onRenameSession}
          onDelete={props.onDeleteSession}
        />
      ))}
    </>
  );
}
