import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { TeamMember } from "@veykor/shared";
import { removeQueuedTurn } from "../../chat/chat-client.ts";
import { useTeamStore } from "../team-store.ts";

interface Props {
  member: TeamMember;
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

  if (props.member.queuedMessages.length === 0) {
    return null;
  }

  return (
    <div
      className="space-y-2 px-4 py-3"
      aria-label={`${props.member.name} queued messages`}
    >
      <p className="text-xs font-semibold text-zinc-400">
        Queued messages · {props.member.queuedMessages.length}
      </p>
      {props.member.queuedMessages.map((message) => (
        <div
          key={message.id}
          className="flex items-start justify-between gap-2 text-xs font-light text-zinc-400"
        >
          <p className="line-clamp-2 whitespace-pre-wrap">
            {message.text ||
              `${message.imageCount} attached image${message.imageCount === 1 ? "" : "s"}`}
          </p>
          <button
            type="button"
            title="Remove queued message"
            aria-label="Remove queued message"
            className="shrink-0 rounded p-1 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={() => {
              void remove(message.id);
            }}
          >
            <XMarkIcon className="size-3" />
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default MemberQueue;
