export const questionLimits = {
  minQuestions: 1,
  maxQuestions: 3,
  minOptions: 2,
  maxOptions: 5,
  maxIdLength: 64,
  maxQuestionLength: 500,
  maxLabelLength: 80,
  maxDescriptionLength: 240,
  maxCustomAnswerLength: 2000,
  maxPendingPerChat: 10,
  maxSettledReturned: 50,
} as const;

export const customAnswerOptionId = "custom";

export const customAnswerLabel = "Write your own answer";

export const questionIdPattern = /^[A-Za-z0-9_-]+$/;

export interface QuestionOption {
  id: string;
  label: string;
  description: string;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  options: Array<QuestionOption>;
  recommendedOptionId: string;
}

export type QuestionAnswerKind = "option" | "custom";

export interface QuestionAnswer {
  questionId: string;
  kind: QuestionAnswerKind;
  optionId: string;
  label: string;
  customText: string;
}

export interface AnswerInput {
  questionId: string;
  optionId?: string;
  customText?: string;
}

export interface SubmitAnswersRequest {
  answers: Array<AnswerInput>;
}

export type QuestionRequestStatus =
  "pending" | "answered" | "cancelled" | "orphaned";

export interface QuestionRequest {
  id: string;
  rootId: string;
  memberId: string;
  agentId: string;
  agentName: string;
  isMain: boolean;
  status: QuestionRequestStatus;
  questions: Array<ClarifyQuestion>;
  answers: Array<QuestionAnswer>;
  notice: string;
  reason: string;
  createdAt: string;
  settledAt: string;
}

export interface QuestionListResponse {
  pending: Array<QuestionRequest>;
  settled: Array<QuestionRequest>;
}

export const questionPaths = {
  questions: (id: string) => `/api/chats/${id}/questions`,
  answer: (id: string, requestId: string) =>
    `/api/chats/${id}/questions/${encodeURIComponent(requestId)}/answers`,
  cancel: (id: string, requestId: string) =>
    `/api/chats/${id}/questions/${encodeURIComponent(requestId)}/cancel`,
} as const;
