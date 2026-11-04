import { useState } from "react";
import type { QuestionRequest } from "@veykor/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import ComposerActivityPanel from "./composer-activity-panel.tsx";
import QuestionCard from "./question-card.tsx";
import { useChatStore } from "../chat-store.ts";
import { visibleOrphanedQuestions } from "../question-drafts.ts";

interface Props {
  first: boolean;
  last: boolean;
  pending: Array<QuestionRequest>;
  recent: Array<QuestionRequest>;
  hideOrigin?: boolean;
  onSettled?: () => void;
}

function QuestionPanel(props: Props) {
  const dismissed = useChatStore((state) => state.dismissedQuestions);
  const dismissOrphaned = useChatStore((state) => state.dismissOrphaned);

  const [index, setIndex] = useState(0);
  const [knownIds, setKnownIds] = useState("");

  const pending = props.pending;
  const ids = pending.map((request) => request.id).join(",");

  if (ids !== knownIds) {
    setKnownIds(ids);
    setIndex(0);
  }

  const attention = visibleOrphanedQuestions(props.recent, dismissed);

  if (pending.length === 0 && attention.length === 0) {
    return null;
  }

  const clamped = Math.min(index, Math.max(pending.length - 1, 0));
  const current = pending.length > 0 ? pending[clamped] : null;

  return (
    <ComposerActivityPanel
      controls={
        pending.length > 1 ? (
          <div className="flex items-center gap-1">
            <button
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              onClick={() => setIndex(Math.max(clamped - 1, 0))}
              title="Previous question"
              type="button"
            >
              <ChevronLeftIcon className="size-4" />
            </button>

            <span className="text-xs text-zinc-500">
              {clamped + 1} of {pending.length}
            </span>

            <button
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              onClick={() =>
                setIndex(Math.min(clamped + 1, pending.length - 1))
              }
              title="Next question"
              type="button"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        ) : null
      }
      count={pending.length + attention.length}
      first={props.first}
      last={props.last}
      title="Questions"
    >
      {current !== null && current !== undefined ? (
        <QuestionCard
          hideOrigin={props.hideOrigin}
          key={current.id}
          onSettled={props.onSettled}
          request={current}
        />
      ) : null}

      {attention.map((request) => (
        <div className="space-y-2 px-4 pb-3" key={request.id}>
          <p className="text-[13px] font-semibold text-zinc-100">
            No longer waiting
          </p>

          <p className="text-xs font-light text-zinc-400">
            {request.reason === ""
              ? "The agent is no longer waiting for this answer. Send a message to continue."
              : request.reason}
          </p>

          <button
            className="rounded-full px-3 py-1 text-[13px] font-light text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            onClick={() => dismissOrphaned(request.id)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ))}
    </ComposerActivityPanel>
  );
}

export default QuestionPanel;
