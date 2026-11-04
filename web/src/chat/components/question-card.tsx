import { useState } from "react";
import { customAnswerLabel, customAnswerOptionId } from "@veykor/shared";
import type {
  AnswerInput,
  ClarifyQuestion,
  QuestionRequest,
} from "@veykor/shared";
import { useChatStore } from "../chat-store.ts";
import { readQuestionDraft, writeQuestionDraft } from "../question-drafts.ts";
import type { QuestionDraft } from "../question-drafts.ts";

interface Props {
  request: QuestionRequest;
  hideOrigin?: boolean;
  onSettled?: () => void;
}

function isAnswered(question: ClarifyQuestion, draft: QuestionDraft): boolean {
  if (question.options.length === 0) {
    return (draft.customs[question.id] ?? "").trim() !== "";
  }

  const selection = draft.selections[question.id] ?? "";

  if (selection === customAnswerOptionId) {
    return (draft.customs[question.id] ?? "").trim() !== "";
  }

  return selection !== "";
}

function QuestionCard(props: Props) {
  const answerQuestion = useChatStore((state) => state.answerQuestion);
  const cancelQuestion = useChatStore((state) => state.cancelQuestion);

  const [draft, setDraft] = useState<QuestionDraft>(() =>
    readQuestionDraft(props.request.id),
  );
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  const request = props.request;
  const busy = submitting || cancelling;
  const remaining = request.questions.filter(
    (question) => !isAnswered(question, draft),
  ).length;
  const showOrigin =
    props.hideOrigin !== true && (!request.isMain || request.agentName !== "");

  function select(questionId: string, optionId: string) {
    setDraft((current) => {
      const next: QuestionDraft = {
        selections: { ...current.selections, [questionId]: optionId },
        customs: current.customs,
      };

      writeQuestionDraft(request.id, next);

      return next;
    });
  }

  function editCustom(questionId: string, value: string) {
    setDraft((current) => {
      const next: QuestionDraft = {
        selections: current.selections,
        customs: { ...current.customs, [questionId]: value },
      };

      writeQuestionDraft(request.id, next);

      return next;
    });
  }

  async function handleSubmit() {
    if (busy || remaining > 0) {
      return;
    }

    const answers: Array<AnswerInput> = request.questions.map((question) => {
      if (
        question.options.length === 0 ||
        draft.selections[question.id] === customAnswerOptionId
      ) {
        return {
          questionId: question.id,
          customText: (draft.customs[question.id] ?? "").trim(),
        };
      }

      return {
        questionId: question.id,
        optionId: draft.selections[question.id],
      };
    });

    setSubmitting(true);
    setError("");

    try {
      await answerQuestion(request.id, answers);
      props.onSettled?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to send your answers.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (busy) {
      return;
    }

    setCancelling(true);
    setError("");

    try {
      await cancelQuestion(request.id);
      props.onSettled?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to cancel the question.",
      );
    } finally {
      setCancelling(false);
    }
  }

  function optionRow(question: ClarifyQuestion, optionId: string) {
    const questionId = question.id;
    const checked = draft.selections[questionId] === optionId;
    const inputId = `question-${request.id}-${questionId}-${optionId}`;

    if (optionId === customAnswerOptionId) {
      return (
        <div key={optionId}>
          <label
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px] font-light transition-colors ${
              checked
                ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                : "border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900"
            }`}
            htmlFor={inputId}
          >
            <input
              checked={checked}
              className="size-3.5 shrink-0 accent-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100"
              disabled={busy}
              id={inputId}
              name={`question-${request.id}-${questionId}`}
              onChange={() => select(questionId, optionId)}
              type="radio"
              value={optionId}
            />

            <span>{customAnswerLabel}</span>
          </label>

          {checked ? (
            <textarea
              aria-label={`Your answer to: ${question.question}`}
              className="mt-2 max-h-40 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] font-light text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-zinc-500"
              disabled={busy}
              maxLength={2000}
              onChange={(event) => editCustom(questionId, event.target.value)}
              placeholder="Write your answer…"
              rows={2}
              value={draft.customs[questionId] ?? ""}
            />
          ) : null}
        </div>
      );
    }

    const option = question.options.find((entry) => entry.id === optionId);

    if (!option) {
      return null;
    }

    const recommended = question.recommendedOptionId === option.id;

    return (
      <label
        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 transition-colors ${
          checked
            ? "border-zinc-500 bg-zinc-800"
            : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
        }`}
        htmlFor={inputId}
        key={optionId}
      >
        <input
          checked={checked}
          className="mt-1 size-3.5 shrink-0 accent-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100"
          disabled={busy}
          id={inputId}
          name={`question-${request.id}-${questionId}`}
          onChange={() => select(questionId, optionId)}
          type="radio"
          value={optionId}
        />

        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-[13px] font-normal text-zinc-100">
            <span>{option.label}</span>

            {recommended ? (
              <span className="rounded-full border border-emerald-700 bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-300">
                Recommended
              </span>
            ) : null}
          </span>

          {option.description !== "" ? (
            <span className="mt-0.5 block text-xs font-light text-zinc-400">
              {option.description}
            </span>
          ) : null}
        </span>
      </label>
    );
  }

  function questionBlock(question: ClarifyQuestion, index: number) {
    const title =
      request.questions.length > 1
        ? `${index + 1}. ${question.question}`
        : question.question;

    return (
      <fieldset key={question.id}>
        <legend className="text-[13px] font-semibold text-zinc-100">
          {title}
        </legend>

        {question.options.length === 0 ? (
          <textarea
            aria-label={question.question}
            className="mt-2 max-h-40 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] font-light text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-zinc-500"
            disabled={busy}
            maxLength={2000}
            onChange={(event) => editCustom(question.id, event.target.value)}
            placeholder="Write your answer…"
            rows={2}
            value={draft.customs[question.id] ?? ""}
          />
        ) : (
          <div className="mt-2 space-y-1.5">
            {question.options.map((option) => optionRow(question, option.id))}
            {optionRow(question, customAnswerOptionId)}
          </div>
        )}
      </fieldset>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-3">
      {showOrigin ? (
        <p className="text-[11px] font-light text-zinc-500">
          From {request.agentName === "" ? "teammate" : request.agentName}
          {request.isMain ? "" : " · delegated agent"}
        </p>
      ) : null}

      {request.questions.map((question, index) =>
        questionBlock(question, index),
      )}

      {error !== "" ? (
        <p className="text-xs font-light text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-full bg-zinc-100 px-4 py-1.5 text-[13px] font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 light:hover:bg-zinc-200"
          disabled={busy || remaining > 0}
          onClick={() => void handleSubmit()}
          type="button"
        >
          {submitting
            ? "Sending…"
            : `Send ${request.questions.length === 1 ? "answer" : "answers"}`}
        </button>

        <button
          className="rounded-full px-3 py-1.5 text-[13px] font-light text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={busy}
          onClick={() => void handleCancel()}
          type="button"
        >
          {cancelling ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

export default QuestionCard;
