import { Hono } from "hono";
import type { DelegateTaskInput } from "@veykor/shared";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { deleteConversation, isInternalConversation, listInternalConversations, readConversation } from "../chat/conversations.js";
import { removeStaged } from "../chat/attachments.js";
import { chatProviderFor } from "../providers/index.js";
import { deleteCollaboration, readTask } from "./store.js";
import { buildDetail, buildSnapshot } from "./snapshot.js";
import { delegateTask } from "./tasks.js";
import { requestInterruption } from "./interruption.js";
import { sweepOnce } from "./sweeper.js";

export const collabRoute = new Hono<AuthEnv>();

collabRoute.use("*", requireAuth);

function validParent(userId: number, parentId: string) {
  const parent = readConversation(userId, parentId);

  if (!parent || isInternalConversation(parent) || !parent.projectId) {
    return undefined;
  }

  return parent;
}

collabRoute.get("/:parentId", (c) => {
  const snapshot = validParent(c.get("user").id, c.req.param("parentId"))
    ? buildSnapshot(c.get("user").id, c.req.param("parentId"))
    : undefined;

  if (!snapshot) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  return c.json({ snapshot });
});

collabRoute.get("/:parentId/detail", async (c) => {
  const detail = validParent(c.get("user").id, c.req.param("parentId"))
    ? await buildDetail(c.get("user").id, c.req.param("parentId"))
    : undefined;

  if (!detail) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  return c.json(detail);
});

collabRoute.post("/:parentId/delegate", async (c) => {
  const userId = c.get("user").id;
  const parentId = c.req.param("parentId");

  if (!validParent(userId, parentId)) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const input = (await c.req
    .json()
    .catch(() => null)) as DelegateTaskInput | null;

  if (
    !input ||
    typeof input.agentId !== "string" ||
    typeof input.title !== "string" ||
    typeof input.instructions !== "string"
  ) {
    return c.json({ error: "Choose an agent and describe the task" }, 400);
  }

  try {
    const { task, reusedSession } = await delegateTask({
      userId,
      parentConversationId: parentId,
      callerConversationId: parentId,
      agentId: input.agentId,
      title: input.title,
      instructions: input.instructions,
      expectedOutcome: input.expectedOutcome,
      context: input.context,
      dependsOn: input.dependsOn,
    });

    void sweepOnce();

    return c.json(
      {
        taskId: task.id,
        conversationId: task.conversationId,
        participantId: task.participantId,
        state: task.state,
        reusedSession,
      },
      201,
    );
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Unable to delegate" },
      400,
    );
  }
});

collabRoute.post("/tasks/:taskId/interrupt", async (c) => {
  const userId = c.get("user").id;
  const input = (await c.req.json().catch(() => ({}))) as {
    reason?: string;
  };
  const task = readTask(userId, c.req.param("taskId"));

  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  try {
    const { task: updated, alreadyTerminal } = await requestInterruption({
      userId,
      taskId: task.id,
      reason: typeof input.reason === "string" ? input.reason : "",
      sourceKind: "human",
      sourceConversationId: task.parentConversationId,
      sourceName: "You",
    });

    return c.json({
      taskId: updated.id,
      state: updated.state,
      interruptState: updated.interruptState,
      detail: alreadyTerminal
        ? `This task already ${updated.state}.`
        : updated.interruptState === "confirmed"
          ? "The delegate was stopped."
          : "Stopping the delegate…",
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Unable to stop" },
      400,
    );
  }
});

export async function deleteCollaborationTree(
  userId: number,
  parentId: string,
) {
  for (const metadata of listInternalConversations(userId, parentId)) {
    const provider = chatProviderFor(metadata.providerId);

    await provider?.release(userId, metadata.id).catch(() => undefined);

    await Promise.all(
      metadata.attachments.map((attachment) => removeStaged(attachment.id)),
    );

    deleteConversation(userId, metadata.id);
  }

  deleteCollaboration(userId, parentId);
}
