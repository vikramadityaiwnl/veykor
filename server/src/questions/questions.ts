import { Hono } from "hono";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import { ownedChat, recordTeamEvent, teamRoot } from "../teams/team-runtime.js";
import {
  QuestionError,
  answerQuestionRequest,
  cancelQuestionRequest,
  listQuestions,
  questionAnsweredText,
  questionCancelledText,
} from "./question-store.js";

export const questionRoute = new Hono<AuthEnv>();

questionRoute.use("*", requireAuth);

questionRoute.get("/:id/questions", (c) => {
  const userId = c.get("user").id;
  const row = ownedChat(userId, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found." }, 404);
  }

  return c.json(listQuestions(userId, teamRoot(row)));
});

questionRoute.post("/:id/questions/:requestId/answers", async (c) => {
  const userId = c.get("user").id;
  const row = ownedChat(userId, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found." }, 404);
  }

  let submission: unknown;

  try {
    const body = (await c.req.json()) as { answers?: unknown };

    submission = body.answers;
  } catch {
    return c.json({ error: "Answer every question to continue." }, 400);
  }

  try {
    const { record, alreadySettled } = answerQuestionRequest(
      userId,
      teamRoot(row),
      c.req.param("requestId"),
      submission,
    );

    if (!alreadySettled) {
      const member = ownedChat(userId, record.memberId);

      if (member) {
        recordTeamEvent(
          member,
          "question-answered",
          questionAnsweredText(record),
        );
      }
    }

    return c.json({ request: record, alreadySettled });
  } catch (cause) {
    if (cause instanceof QuestionError) {
      const status = cause.status === 404 ? 404 : 400;

      return c.json({ error: cause.message }, status);
    }

    throw cause;
  }
});

questionRoute.post("/:id/questions/:requestId/cancel", async (c) => {
  const userId = c.get("user").id;
  const row = ownedChat(userId, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Chat not found." }, 404);
  }

  let reason = "";

  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      reason?: unknown;
    };

    if (typeof body.reason === "string") {
      reason = body.reason.trim().slice(0, 500);
    }
  } catch {
    reason = "";
  }

  try {
    const { record, alreadySettled } = cancelQuestionRequest(
      userId,
      teamRoot(row),
      c.req.param("requestId"),
      reason,
    );

    if (!alreadySettled) {
      const member = ownedChat(userId, record.memberId);

      if (member) {
        recordTeamEvent(
          member,
          "question-cancelled",
          questionCancelledText(record),
        );
      }
    }

    return c.json({ request: record, alreadySettled });
  } catch (cause) {
    if (cause instanceof QuestionError) {
      const status = cause.status === 404 ? 404 : 400;

      return c.json({ error: cause.message }, status);
    }

    throw cause;
  }
});
