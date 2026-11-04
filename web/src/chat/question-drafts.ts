import type { QuestionRequest } from "@veykor/shared";

export interface QuestionDraft {
  selections: Record<string, string>;
  customs: Record<string, string>;
}

const dismissedKey = "veykor:dismissed-questions";

function draftKey(requestId: string): string {
  return `veykor:question-draft:${requestId}`;
}

export function readQuestionDraft(requestId: string): QuestionDraft {
  try {
    const raw = window.localStorage.getItem(draftKey(requestId));

    if (raw === null) {
      return { selections: {}, customs: {} };
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return { selections: {}, customs: {} };
    }

    const { selections, customs } = parsed as Partial<QuestionDraft>;

    return {
      selections:
        selections !== undefined && typeof selections === "object"
          ? selections
          : {},
      customs:
        customs !== undefined && typeof customs === "object" ? customs : {},
    };
  } catch {
    return { selections: {}, customs: {} };
  }
}

export function writeQuestionDraft(
  requestId: string,
  draft: QuestionDraft,
): void {
  try {
    window.localStorage.setItem(draftKey(requestId), JSON.stringify(draft));
  } catch {
    // Best effort; the draft still holds for this view.
  }
}

export function clearQuestionDraft(requestId: string): void {
  try {
    window.localStorage.removeItem(draftKey(requestId));
  } catch {
    // Best effort.
  }
}

export function readDismissedQuestions(): Array<string> {
  try {
    const raw = window.localStorage.getItem(dismissedKey);

    if (raw === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function writeDismissedQuestions(ids: Array<string>): void {
  try {
    window.localStorage.setItem(dismissedKey, JSON.stringify(ids.slice(-100)));
  } catch {
    // Best effort.
  }
}

export function visibleOrphanedQuestions(
  recent: Array<QuestionRequest>,
  dismissed: Array<string>,
): Array<QuestionRequest> {
  const hidden = new Set(dismissed);

  return recent.filter(
    (request) => request.status === "orphaned" && !hidden.has(request.id),
  );
}
