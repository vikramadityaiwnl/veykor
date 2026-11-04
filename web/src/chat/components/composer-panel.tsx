import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import ComposerActivityPanel from "./composer-activity-panel.tsx";
import TeamTodos from "../../teams/components/team-todos.tsx";
import { useTeamStore } from "../../teams/team-store.ts";
import ApprovalCard from "./approval-card.tsx";
import QueuedMessages from "./queued-messages.tsx";
import QuestionPanel from "./question-panel.tsx";
import { useChatStore } from "../chat-store.ts";
import { visibleOrphanedQuestions } from "../question-drafts.ts";

function ComposerPanel() {
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);
  const queuedMessages = useChatStore((s) => s.queuedMessages);
  const pendingQuestions = useChatStore((s) => s.pendingQuestions);
  const recentQuestions = useChatStore((s) => s.recentQuestions);
  const dismissedQuestions = useChatStore((s) => s.dismissedQuestions);

  const activeChatId = useChatStore((state) => state.activeChatId);
  const taskCount = useTeamStore((state) =>
    state.snapshot.members.reduce(
      (count, member) => count + member.todos.length,
      0,
    ),
  );
  const [index, setIndex] = useState(0);
  const [knownIds, setKnownIds] = useState("");

  const ids = pendingApprovals.map((approval) => approval.approvalId).join(",");

  if (ids !== knownIds) {
    setKnownIds(ids);
    setIndex(0);
  }

  const attention = visibleOrphanedQuestions(
    recentQuestions,
    dismissedQuestions,
  );
  const showQuestions = pendingQuestions.length > 0 || attention.length > 0;

  if (
    pendingApprovals.length === 0 &&
    queuedMessages.length === 0 &&
    taskCount === 0 &&
    !showQuestions
  ) {
    return null;
  }

  const clamped = Math.min(index, Math.max(pendingApprovals.length - 1, 0));
  const current =
    pendingApprovals.length > 0 ? pendingApprovals[clamped] : null;

  const showApprovals = current !== null && current !== undefined;
  const showQueue = queuedMessages.length > 0;
  const showTasks = taskCount > 0;

  const first = showApprovals
    ? "approvals"
    : showQuestions
      ? "questions"
      : showQueue
        ? "queue"
        : "tasks";
  const last = showTasks
    ? "tasks"
    : showQueue
      ? "queue"
      : showQuestions
        ? "questions"
        : "approvals";

  return (
    <>
      {showApprovals ? (
        <ComposerActivityPanel
          controls={
            pendingApprovals.length > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  onClick={() => setIndex(Math.max(clamped - 1, 0))}
                  title="Previous approval"
                  type="button"
                >
                  <ChevronLeftIcon className="size-4" />
                </button>

                <span className="text-xs text-zinc-500">
                  {clamped + 1} of {pendingApprovals.length}
                </span>

                <button
                  className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  onClick={() =>
                    setIndex(Math.min(clamped + 1, pendingApprovals.length - 1))
                  }
                  title="Next approval"
                  type="button"
                >
                  <ChevronRightIcon className="size-4" />
                </button>
              </div>
            ) : null
          }
          count={pendingApprovals.length}
          first={first === "approvals"}
          last={last === "approvals"}
          title="Needs your approval"
        >
          {current !== null && current !== undefined ? (
            <ApprovalCard approval={current} />
          ) : null}
        </ComposerActivityPanel>
      ) : null}

      {showQuestions ? (
        <QuestionPanel
          first={first === "questions"}
          last={last === "questions"}
          pending={pendingQuestions}
          recent={recentQuestions}
        />
      ) : null}

      {showQueue ? (
        <ComposerActivityPanel
          count={queuedMessages.length}
          first={first === "queue"}
          last={last === "queue"}
          title="Queued messages"
        >
          <QueuedMessages />
        </ComposerActivityPanel>
      ) : null}

      {showTasks ? (
        <ComposerActivityPanel
          count={taskCount}
          first={first === "tasks"}
          last={last === "tasks"}
          title="Team tasks"
        >
          <TeamTodos memberId={activeChatId ?? ""} />
        </ComposerActivityPanel>
      ) : null}
    </>
  );
}

export default ComposerPanel;
