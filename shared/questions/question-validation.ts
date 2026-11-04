import {
  customAnswerLabel,
  customAnswerOptionId,
  questionIdPattern,
  questionLimits,
} from "./question-contracts.js";
import type {
  AnswerInput,
  ClarifyQuestion,
  QuestionAnswer,
  QuestionOption,
} from "./question-contracts.js";

export type QuestionValidation =
  | { questions: Array<ClarifyQuestion>; notice: string; error: "" }
  | { questions: []; notice: ""; error: string };

export type AnswerValidation =
  | { answers: Array<QuestionAnswer>; error: "" }
  | { answers: []; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength + 1);
}

function validId(value: string): boolean {
  return (
    value !== "" &&
    value.length <= questionLimits.maxIdLength &&
    questionIdPattern.test(value)
  );
}

export function isReservedCustomOption(id: string, label: string): boolean {
  return (
    id.trim().toLowerCase() === customAnswerOptionId ||
    label.trim().toLowerCase() === customAnswerLabel.toLowerCase()
  );
}

function validateOption(
  value: unknown,
  seen: Set<string>,
): { option: QuestionOption | null; error: string; stripped: boolean } {
  if (!isRecord(value)) {
    return {
      option: null,
      error: "Each option needs an id and a label.",
      stripped: false,
    };
  }

  const id = cleanText(value["id"], questionLimits.maxIdLength);
  const label = cleanText(value["label"], questionLimits.maxLabelLength);
  const description = cleanText(
    value["description"] ?? "",
    questionLimits.maxDescriptionLength,
  );

  if (isReservedCustomOption(id, label)) {
    return { option: null, error: "", stripped: true };
  }

  if (!validId(id)) {
    return {
      option: null,
      error:
        "Each option id must use only letters, numbers, underscore, or hyphen, at most 64 characters.",
      stripped: false,
    };
  }

  if (seen.has(id)) {
    return {
      option: null,
      error: `Option id "${id}" is used more than once in this question.`,
      stripped: false,
    };
  }

  if (label === "") {
    return {
      option: null,
      error: "Each option needs a non-empty label.",
      stripped: false,
    };
  }

  if (label.length > questionLimits.maxLabelLength) {
    return {
      option: null,
      error: `Option label "${label.slice(0, 40)}" must be under 80 characters.`,
      stripped: false,
    };
  }

  if (description.length > questionLimits.maxDescriptionLength) {
    return {
      option: null,
      error: "Option descriptions must be under 240 characters.",
      stripped: false,
    };
  }

  seen.add(id);

  return {
    option: { id, label, description },
    error: "",
    stripped: false,
  };
}

function validateQuestion(
  value: unknown,
  seen: Set<string>,
): {
  question: ClarifyQuestion | null;
  error: string;
  strippedCustom: boolean;
} {
  if (!isRecord(value)) {
    return {
      question: null,
      error: "Each question needs an id and question text.",
      strippedCustom: false,
    };
  }

  const id = cleanText(value["id"], questionLimits.maxIdLength);
  const question = cleanText(
    value["question"],
    questionLimits.maxQuestionLength,
  );

  if (!validId(id)) {
    return {
      question: null,
      error:
        "Each question id must use only letters, numbers, underscore, or hyphen, at most 64 characters.",
      strippedCustom: false,
    };
  }

  if (seen.has(id)) {
    return {
      question: null,
      error: `Question id "${id}" is used more than once in this request.`,
      strippedCustom: false,
    };
  }

  if (question === "") {
    return {
      question: null,
      error: "Each question needs non-empty question text.",
      strippedCustom: false,
    };
  }

  if (question.length > questionLimits.maxQuestionLength) {
    return {
      question: null,
      error: "Each question must be under 500 characters.",
      strippedCustom: false,
    };
  }

  const rawOptions = value["options"] ?? [];

  if (!Array.isArray(rawOptions)) {
    return {
      question: null,
      error: "Question options must be an array.",
      strippedCustom: false,
    };
  }

  const options: Array<QuestionOption> = [];
  const seenOptions = new Set<string>();

  let strippedCustom = false;

  for (const raw of rawOptions) {
    const validated = validateOption(raw, seenOptions);

    if (validated.error !== "") {
      return {
        question: null,
        error: validated.error,
        strippedCustom: false,
      };
    }

    if (validated.stripped) {
      strippedCustom = true;
      continue;
    }

    if (validated.option !== null) {
      options.push(validated.option);
    }
  }

  if (options.length === 1) {
    return {
      question: null,
      error:
        "Provide two to five suggested options, or omit options for a free-text-only question.",
      strippedCustom: false,
    };
  }

  if (options.length > questionLimits.maxOptions) {
    return {
      question: null,
      error: "Provide at most five suggested options per question.",
      strippedCustom: false,
    };
  }

  const rawRecommended = value["recommendedOptionId"] ?? "";
  const recommendedOptionId =
    typeof rawRecommended === "string" ? rawRecommended.trim() : "";

  if (recommendedOptionId !== "") {
    if (options.length === 0) {
      return {
        question: null,
        error: "Free-text-only questions cannot recommend an option.",
        strippedCustom: false,
      };
    }

    if (!options.some((option) => option.id === recommendedOptionId)) {
      return {
        question: null,
        error: `Recommended option "${recommendedOptionId}" is not one of this question's options.`,
        strippedCustom: false,
      };
    }
  }

  seen.add(id);

  return {
    question: { id, question, options, recommendedOptionId },
    error: "",
    strippedCustom,
  };
}

export function validateQuestionPayload(value: unknown): QuestionValidation {
  if (!isRecord(value)) {
    return {
      questions: [],
      notice: "",
      error: "Ask one to three questions.",
    };
  }

  const rawQuestions = value["questions"];

  if (!Array.isArray(rawQuestions)) {
    return {
      questions: [],
      notice: "",
      error: "Ask one to three questions.",
    };
  }

  if (
    rawQuestions.length < questionLimits.minQuestions ||
    rawQuestions.length > questionLimits.maxQuestions
  ) {
    return {
      questions: [],
      notice: "",
      error: "Ask one to three questions per request.",
    };
  }

  const questions: Array<ClarifyQuestion> = [];
  const seen = new Set<string>();

  let strippedCustom = false;

  for (const raw of rawQuestions) {
    const validated = validateQuestion(raw, seen);

    if (validated.error !== "") {
      return { questions: [], notice: "", error: validated.error };
    }

    if (validated.strippedCustom) {
      strippedCustom = true;
    }

    if (validated.question !== null) {
      questions.push(validated.question);
    }
  }

  return {
    questions,
    notice: strippedCustom
      ? "A custom-answer option was removed: veykor appends its own automatically."
      : "",
    error: "",
  };
}

function validateAnswerInput(
  stored: ClarifyQuestion,
  raw: AnswerInput,
): { answer: QuestionAnswer | null; error: string } {
  const optionId = typeof raw.optionId === "string" ? raw.optionId.trim() : "";
  const customText =
    typeof raw.customText === "string" ? raw.customText.trim() : "";

  if (optionId !== "" && customText !== "") {
    return {
      answer: null,
      error: `Answer "${stored.id}" with either an option or custom text, not both.`,
    };
  }

  if (optionId !== "") {
    const option = stored.options.find((entry) => entry.id === optionId);

    if (!option) {
      return {
        answer: null,
        error: `Option "${optionId}" is not one of the offered choices.`,
      };
    }

    return {
      answer: {
        questionId: stored.id,
        kind: "option",
        optionId: option.id,
        label: option.label,
        customText: "",
      },
      error: "",
    };
  }

  if (customText === "") {
    return {
      answer: null,
      error: `Question "${stored.id}" needs an option or a written answer.`,
    };
  }

  if (customText.length > questionLimits.maxCustomAnswerLength) {
    return {
      answer: null,
      error: "Written answers must be under 2,000 characters.",
    };
  }

  return {
    answer: {
      questionId: stored.id,
      kind: "custom",
      optionId: "",
      label: "",
      customText,
    },
    error: "",
  };
}

export function validateAnswerSubmission(
  stored: Array<ClarifyQuestion>,
  raw: unknown,
): AnswerValidation {
  if (!Array.isArray(raw)) {
    return { answers: [], error: "Answer every question to continue." };
  }

  if (raw.length !== stored.length) {
    return { answers: [], error: "Answer every question to continue." };
  }

  const answers: Array<QuestionAnswer> = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry["questionId"] !== "string") {
      return { answers: [], error: "Answer every question to continue." };
    }

    const questionId = (entry["questionId"] as string).trim();
    const question = stored.find((item) => item.id === questionId);

    if (!question) {
      return {
        answers: [],
        error: `Question "${questionId}" is not part of this request.`,
      };
    }

    if (seen.has(questionId)) {
      return {
        answers: [],
        error: `Question "${questionId}" is answered more than once.`,
      };
    }

    seen.add(questionId);

    const validated = validateAnswerInput(question, {
      questionId,
      optionId:
        typeof entry["optionId"] === "string"
          ? (entry["optionId"] as string)
          : undefined,
      customText:
        typeof entry["customText"] === "string"
          ? (entry["customText"] as string)
          : undefined,
    });

    if (validated.error !== "") {
      return { answers: [], error: validated.error };
    }

    if (validated.answer !== null) {
      answers.push(validated.answer);
    }
  }

  answers.sort(
    (a, b) =>
      stored.findIndex((item) => item.id === a.questionId) -
      stored.findIndex((item) => item.id === b.questionId),
  );

  return { answers, error: "" };
}
