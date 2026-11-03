import { useState } from "react";
import type { ChatApprovalChoice, ChatApprovalRequest } from "@veykor/shared";
import { useChatStore } from "../chat-store.ts";

interface Props {
  approval: ChatApprovalRequest;
}

function ApprovalCard(props: Props) {
  const decideApproval = useChatStore((s) => s.decideApproval);

  const [expanded, setExpanded] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [feedbackChoice, setFeedbackChoice] =
    useState<ChatApprovalChoice | null>(null);
  const [feedback, setFeedback] = useState("");

  const approval = props.approval;

  async function handleDecide(choice: ChatApprovalChoice, comment?: string) {
    setDeciding(true);

    try {
      await decideApproval(approval.approvalId, choice.choiceId, comment);
    } finally {
      setDeciding(false);
      setFeedbackChoice(null);
      setFeedback("");
    }
  }

  function handleChoice(choice: ChatApprovalChoice) {
    if (choice.acceptsFeedback) {
      setFeedbackChoice(choice);
      return;
    }

    void handleDecide(choice);
  }

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-zinc-400">
          {approval.toolName}
        </span>

        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
          {approval.subjectKind}
        </span>
      </div>

      <p className="mt-1 text-sm font-semibold text-zinc-100">
        {approval.subjectTitle}
      </p>

      <button
        className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        {expanded ? "Hide details" : "Show details"}
      </button>

      {expanded ? (
        <pre className="mt-2 max-h-32 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
          {approval.rawArgs}
        </pre>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {approval.choices.map((choice) => {
          const approve = choice.decision !== "deny";

          return (
            <button
              className={
                approve
                  ? "rounded-full bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-white light:hover:bg-zinc-200 disabled:opacity-40"
                  : "rounded-full border border-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              }
              disabled={deciding}
              key={choice.choiceId}
              onClick={() => handleChoice(choice)}
              title={
                choice.rulePreview === "" ? choice.scope : choice.rulePreview
              }
              type="button"
            >
              {choice.label}
            </button>
          );
        })}
      </div>

      {feedbackChoice !== null ? (
        <div className="mt-3 flex gap-2">
          <input
            autoFocus
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={`Feedback for "${feedbackChoice.label}"...`}
            type="text"
            value={feedback}
          />

          <button
            className="rounded-full bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-white light:hover:bg-zinc-200 disabled:opacity-40"
            disabled={deciding}
            onClick={() => handleDecide(feedbackChoice, feedback)}
            type="button"
          >
            Confirm
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default ApprovalCard;
