import { useState } from "react";
import type { ChatApprovalChoice, ChatApprovalRequest } from "@veykor/shared";
import { semanticColors } from "../../theme/semantic-colors.ts";
import { useChatStore } from "../chat-store.ts";

interface Props {
  approval: ChatApprovalRequest;
}

function shortLabel(label: string): string {
  const prefix = "Always allow in this workspace";

  if (label.startsWith(prefix)) {
    return prefix;
  }

  return label;
}

function isApproveDecision(decision: string): boolean {
  return decision.startsWith("approv");
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
    <div className="px-4 pb-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-zinc-400">
          {approval.toolName}
        </span>

        <span className="rounded-full border border-zinc-700 px-1.5 py-px text-[10px] text-zinc-400">
          {approval.subjectKind}
        </span>
      </div>

      <p className="mt-1 text-[13px] font-semibold text-zinc-100">
        {approval.subjectTitle}
      </p>

      <button
        className="mt-1 text-[11px] text-zinc-500 hover:text-zinc-300"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        {expanded ? "Hide details" : "Show details"}
      </button>

      {expanded ? (
        <pre className="mt-2 max-h-24 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
          {approval.rawArgs}
        </pre>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-2">
        {approval.choices.map((choice) => {
          const approve = isApproveDecision(choice.decision);
          const label = shortLabel(choice.label);

          return (
            <button
              className={`rounded-full px-3 py-1 text-[13px] font-medium disabled:opacity-40 ${
                approve
                  ? semanticColors.success.soft
                  : semanticColors.delete.soft
              }`}
              disabled={deciding}
              key={choice.choiceId}
              onClick={() => handleChoice(choice)}
              title={
                label === choice.label
                  ? choice.rulePreview === ""
                    ? choice.scope
                    : choice.rulePreview
                  : choice.label
              }
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>

      {feedbackChoice !== null ? (
        <div className="mt-2.5 flex gap-2">
          <input
            autoFocus
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={`Feedback for "${feedbackChoice.label}"...`}
            type="text"
            value={feedback}
          />

          <button
            className="rounded-full bg-zinc-100 px-3 py-1 text-[13px] font-medium text-zinc-950 hover:bg-white light:hover:bg-zinc-200 disabled:opacity-40"
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
