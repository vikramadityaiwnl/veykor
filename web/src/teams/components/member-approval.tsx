import { useState } from "react";
import type { ChatApprovalRequest } from "@veykor/shared";
import { decideApproval } from "../../chat/chat-client.ts";

interface Props {
  chatId: string;
  approval: ChatApprovalRequest;
  onDecided: () => void;
}

function MemberApproval(props: Props) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function handleDecision(choiceId: string) {
    setPending(true);
    setError("");

    try {
      await decideApproval(props.chatId, {
        approvalId: props.approval.approvalId,
        choiceId,
        feedback,
      });
      props.onDecided();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to record this decision.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
      <p className="text-xs font-semibold">
        Approval needed · {props.approval.toolName}
      </p>
      <p className="text-xs font-light text-zinc-400">
        {props.approval.subjectTitle}
      </p>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-500">
        {props.approval.rawArgs}
      </pre>
      {props.approval.choices.some((choice) => choice.acceptsFeedback) && (
        <input
          aria-label="Approval feedback"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-light"
          placeholder="Feedback (optional)"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {props.approval.choices.map((choice) => (
          <button
            key={choice.choiceId}
            disabled={pending}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-light hover:bg-zinc-800 disabled:opacity-40"
            type="button"
            onClick={() => {
              void handleDecision(choice.choiceId);
            }}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default MemberApproval;
