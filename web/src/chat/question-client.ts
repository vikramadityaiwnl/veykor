import {
  questionPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type {
  AnswerInput,
  QuestionListResponse,
  QuestionRequest,
} from "@veykor/shared";

export interface QuestionSubmitResponse {
  request: QuestionRequest;
  alreadySettled: boolean;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };

    if (typeof body.error === "string" && body.error !== "") {
      return body.error;
    }
  } catch {
    // fall through to the fallback below
  }

  return "Request failed";
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as T;
}

export async function fetchQuestions(
  id: string,
): Promise<QuestionListResponse> {
  let response: Response;

  try {
    response = await fetch(questionPaths.questions(id), {
      credentials: "same-origin",
      headers: {
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
      },
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as QuestionListResponse;
}

export async function answerQuestions(
  id: string,
  requestId: string,
  answers: Array<AnswerInput>,
): Promise<QuestionSubmitResponse> {
  return postJson<QuestionSubmitResponse>(questionPaths.answer(id, requestId), {
    answers,
  });
}

export async function cancelQuestions(
  id: string,
  requestId: string,
): Promise<QuestionSubmitResponse> {
  return postJson<QuestionSubmitResponse>(
    questionPaths.cancel(id, requestId),
    {},
  );
}
