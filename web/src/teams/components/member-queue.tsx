import { useState } from "react";
import type { TeamMember } from "@veykor/shared";
import QueueList from "../../chat/components/queue-list.tsx";
import {
  removeQueuedTurn,
  reorderQueuedTurns,
} from "../../chat/chat-client.ts";
import { useTeamStore } from "../team-store.ts";

interface Props {
  member: TeamMember;
  onSteer: (id: string) => void;
  onEdit: (id: string) => void;
}

function MemberQueue(props: Props) {
  const [error, setError] = useState("");

  async function remove(id: string) {
    try {
      await removeQueuedTurn(props.member.id, id);
      await useTeamStore.getState().refresh();
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to remove this message.",
      );
    }
  }

  async function reorder(draggedId: string, targetId: string, before: boolean) {
    const ids = props.member.queuedMessages.map((message) => message.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);

    if (from === -1 || to === -1) {
      return;
    }

    const next = [...ids];
    const moved = next.splice(from, 1)[0];

    if (moved === undefined) {
      return;
    }

    let insertAt = next.indexOf(targetId);

    if (!before) {
      insertAt += 1;
    }

    next.splice(insertAt, 0, moved);

    try {
      await reorderQueuedTurns(props.member.id, next);
      await useTeamStore.getState().refresh();
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to reorder these messages.",
      );
    }
  }

  if (props.member.queuedMessages.length === 0) {
    return null;
  }

  return (
    <div>
      <QueueList
        items={props.member.queuedMessages.map((message) => ({
          id: message.id,
          text: message.text,
          imageCount: message.imageCount,
        }))}
        onDelete={(id) => {
          void remove(id);
        }}
        onEdit={props.onEdit}
        onReorder={(draggedId, targetId, before) => {
          void reorder(draggedId, targetId, before);
        }}
        onSteer={props.onSteer}
      />

      {error !== "" && (
        <p role="alert" className="px-4 pb-3 text-xs text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default MemberQueue;
