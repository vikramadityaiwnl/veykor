import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateAnswerSubmission,
  validateQuestionPayload,
} from "@veykor/shared";

function option(id: string, label = id) {
  return { id, label, description: `${label} tradeoff` };
}

test("question payloads accept options, recommendations, and free text", () => {
  const validated = validateQuestionPayload({
    questions: [
      {
        id: "implementation_approach",
        question: "How should this feature behave?",
        options: [option("automatic"), option("review")],
        recommendedOptionId: "review",
      },
      {
        id: "notes",
        question: "Anything else to consider?",
        options: [],
      },
    ],
  });

  assert.equal(validated.error, "");
  assert.equal(validated.notice, "");

  assert.deepEqual(validated.questions, [
    {
      id: "implementation_approach",
      question: "How should this feature behave?",
      options: [
        {
          id: "automatic",
          label: "automatic",
          description: "automatic tradeoff",
        },
        { id: "review", label: "review", description: "review tradeoff" },
      ],
      recommendedOptionId: "review",
    },
    {
      id: "notes",
      question: "Anything else to consider?",
      options: [],
      recommendedOptionId: "",
    },
  ]);
});

test("question payloads require one to three well-formed questions", () => {
  assert.equal(
    validateQuestionPayload({ questions: [] }).error,
    "Ask one to three questions per request.",
  );

  assert.equal(
    validateQuestionPayload({
      questions: [
        { id: "a", question: "A?" },
        { id: "b", question: "B?" },
        { id: "c", question: "C?" },
        { id: "d", question: "D?" },
      ],
    }).error,
    "Ask one to three questions per request.",
  );

  assert.equal(
    validateQuestionPayload({
      questions: [{ id: "has spaces", question: "Q?" }],
    }).error,
    "Each question id must use only letters, numbers, underscore, or hyphen, at most 64 characters.",
  );

  assert.equal(
    validateQuestionPayload({
      questions: [
        { id: "same", question: "First?" },
        { id: "same", question: "Second?" },
      ],
    }).error,
    'Question id "same" is used more than once in this request.',
  );

  assert.equal(
    validateQuestionPayload({ questions: [{ id: "q", question: "   " }] })
      .error,
    "Each question needs non-empty question text.",
  );

  assert.equal(
    validateQuestionPayload({ questions: [{ id: "q", question: "Q?" }] }).error,
    "",
  );
});

test("question payloads require two to five options unless free text", () => {
  assert.equal(
    validateQuestionPayload({
      questions: [{ id: "q", question: "Q?", options: [option("only")] }],
    }).error,
    "Provide two to five suggested options, or omit options for a free-text-only question.",
  );

  assert.equal(
    validateQuestionPayload({
      questions: [
        {
          id: "q",
          question: "Q?",
          options: [
            option("a"),
            option("b"),
            option("c"),
            option("d"),
            option("e"),
            option("f"),
          ],
        },
      ],
    }).error,
    "Provide at most five suggested options per question.",
  );

  assert.equal(
    validateQuestionPayload({
      questions: [
        {
          id: "q",
          question: "Q?",
          options: [option("a"), { id: "a", label: "Other" }],
        },
      ],
    }).error,
    'Option id "a" is used more than once in this question.',
  );

  assert.equal(
    validateQuestionPayload({
      questions: [
        {
          id: "q",
          question: "Q?",
          options: [option("a"), option("b")],
          recommendedOptionId: "missing",
        },
      ],
    }).error,
    'Recommended option "missing" is not one of this question\'s options.',
  );

  assert.equal(
    validateQuestionPayload({
      questions: [{ id: "q", question: "Q?", recommendedOptionId: "a" }],
    }).error,
    "Free-text-only questions cannot recommend an option.",
  );
});

test("question payloads enforce label and description lengths", () => {
  assert.equal(
    validateQuestionPayload({
      questions: [
        {
          id: "q",
          question: "Q?",
          options: [{ id: "a", label: "x".repeat(81) }, option("b")],
        },
      ],
    }).error,
    `Option label "${"x".repeat(40)}" must be under 80 characters.`,
  );

  assert.equal(
    validateQuestionPayload({
      questions: [
        {
          id: "q",
          question: "Q?",
          options: [
            { id: "a", label: "A", description: "x".repeat(241) },
            option("b"),
          ],
        },
      ],
    }).error,
    "Option descriptions must be under 240 characters.",
  );

  assert.equal(
    validateQuestionPayload({
      questions: [{ id: "q", question: "x".repeat(501) }],
    }).error,
    "Each question must be under 500 characters.",
  );
});

test("agent-supplied custom options are stripped with a notice", () => {
  const byId = validateQuestionPayload({
    questions: [
      {
        id: "q",
        question: "Q?",
        options: [option("a"), option("b"), { id: "custom", label: "Other" }],
      },
    ],
  });

  assert.equal(byId.error, "");
  assert.equal(
    byId.notice,
    "A custom-answer option was removed: veykor appends its own automatically.",
  );
  assert.deepEqual(
    byId.questions[0].options.map((entry) => entry.id),
    ["a", "b"],
  );

  const byLabel = validateQuestionPayload({
    questions: [
      {
        id: "q",
        question: "Q?",
        options: [
          option("a"),
          option("b"),
          { id: "other", label: "WRITE YOUR OWN ANSWER" },
        ],
      },
    ],
  });

  assert.equal(byLabel.error, "");
  assert.equal(byLabel.notice, byId.notice);
  assert.equal(byLabel.questions[0].options.length, 2);
});

test("answer submissions resolve option ids against stored questions", () => {
  const stored = validateQuestionPayload({
    questions: [
      {
        id: "approach",
        question: "How?",
        options: [option("automatic"), option("review")],
      },
      { id: "notes", question: "Notes?", options: [] },
    ],
  });

  assert.equal(stored.error, "");

  const validated = validateAnswerSubmission(stored.questions, [
    { questionId: "notes", customText: "  Ship it Friday.  " },
    { questionId: "approach", optionId: "review" },
  ]);

  assert.equal(validated.error, "");
  assert.deepEqual(validated.answers, [
    {
      questionId: "approach",
      kind: "option",
      optionId: "review",
      label: "review",
      customText: "",
    },
    {
      questionId: "notes",
      kind: "custom",
      optionId: "",
      label: "",
      customText: "Ship it Friday.",
    },
  ]);
});

test("answer submissions reject mismatched and empty answers", () => {
  const stored = validateQuestionPayload({
    questions: [
      {
        id: "approach",
        question: "How?",
        options: [option("automatic"), option("review")],
      },
    ],
  });

  assert.equal(stored.error, "");

  const questions = stored.questions;

  assert.equal(
    validateAnswerSubmission(questions, []).error,
    "Answer every question to continue.",
  );

  assert.equal(
    validateAnswerSubmission(questions, [
      { questionId: "other", optionId: "a" },
    ]).error,
    'Question "other" is not part of this request.',
  );

  assert.equal(
    validateAnswerSubmission(questions, [
      { questionId: "approach", optionId: "missing" },
    ]).error,
    'Option "missing" is not one of the offered choices.',
  );

  assert.equal(
    validateAnswerSubmission(questions, [
      { questionId: "approach", customText: "   " },
    ]).error,
    'Question "approach" needs an option or a written answer.',
  );

  assert.equal(
    validateAnswerSubmission(questions, [
      { questionId: "approach", optionId: "review", customText: "Both" },
    ]).error,
    'Answer "approach" with either an option or custom text, not both.',
  );

  assert.equal(
    validateAnswerSubmission(questions, [
      { questionId: "approach", customText: "x".repeat(2001) },
    ]).error,
    "Written answers must be under 2,000 characters.",
  );
});
