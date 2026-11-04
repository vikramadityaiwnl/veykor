import type { QuestionRequest } from "@veykor/shared";

interface Props {
  request: QuestionRequest;
}

function QuestionHistoryRecord(props: Props) {
  const request = props.request;

  const status =
    request.status === "answered"
      ? "Answered"
      : request.status === "cancelled"
        ? "Cancelled"
        : "No longer waiting";

  const showOrigin = !request.isMain || request.agentName !== "";

  return (
    <div className="w-full min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <p className="text-[11px] font-light text-zinc-500">
        {status}
        {showOrigin
          ? ` · ${request.agentName === "" ? "teammate" : request.agentName}`
          : ""}
      </p>

      <div className="mt-2 space-y-2.5">
        {request.questions.map((question) => {
          const answer = request.answers.find(
            (entry) => entry.questionId === question.id,
          );

          return (
            <div key={question.id}>
              <p className="text-[13px] font-semibold text-zinc-200">
                {question.question}
              </p>

              {answer !== undefined ? (
                <p className="mt-0.5 text-[13px] font-light whitespace-pre-wrap break-words text-zinc-400">
                  {answer.kind === "option" ? answer.label : answer.customText}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {request.status !== "answered" && request.reason !== "" ? (
        <p className="mt-2 text-xs font-light text-zinc-500">
          {request.reason}
        </p>
      ) : null}
    </div>
  );
}

export default QuestionHistoryRecord;
