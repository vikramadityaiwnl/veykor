import { and, eq, like } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatInputs } from "../db/schema.js";
import { readConversation } from "../chat/conversations.js";
import { cancelCollabRows, enqueueCollabTurn } from "../chat/collab-dispatch.js";
import { pauseQueue } from "../chat/message-queue.js";
import { chatProviderFor } from "../providers/index.js";
import { activeTaskForSession, listParticipants, terminalTaskStates, updateTask } from "./store.js";
import { followupClientMessageId, transitionTask, wakeSession } from "./tasks.js";
import { maxDelegateReminderTurns } from "./limits.js";

type InputRow = typeof chatInputs.$inferSelect;

export async function onTurnSettled(
  userId: number,
  conversationId: string,
  row: InputRow,
) {
  const metadata = readConversation(userId, conversationId);

  if (!metadata) {
    return;
  }

  const parentId = metadata.parentConversationId || metadata.id;

  if (listParticipants(userId, parentId).length === 0) {
    return;
  }

  if (metadata.parentConversationId) {
    await settleDelegateTurn(userId, parentId, conversationId, row);
    return;
  }

  wakeSession(
    userId,
    parentId,
    parentId,
    "Continue coordinating the collaboration updates above and answer the user.",
  );
}

async function settleDelegateTurn(
  userId: number,
  parentId: string,
  conversationId: string,
  row: InputRow,
) {
  const task = activeTaskForSession(userId, conversationId);

  if (!task || task.parentConversationId !== parentId) {
    wakeSession(
      userId,
      parentId,
      conversationId,
      "Continue with the collaboration updates above.",
    );
    return;
  }

  if (task.interruptState === "requested") {
    return;
  }

  const provider = chatProviderFor(
    readConversation(userId, conversationId)?.providerId || "",
  );
  const snapshot = await provider
    ?.describe(userId, conversationId)
    .catch(() => undefined);

  if ((snapshot?.approvals || []).length > 0) {
    if (task.state !== "waiting-for-approval") {
      transitionTask(
        userId,
        task.id,
        { state: "waiting-for-approval" },
        {
          type: "approval-needed",
          title: `${task.agentName} needs approval`,
          body: `Approval needed for "${task.title}". Open ${task.agentName} to review it.`,
          includeSource: true,
        },
      );
    }

    return;
  }

  if (task.state === "waiting-for-approval") {
    transitionTask(
      userId,
      task.id,
      { state: "running" },
      {
        type: "approval-resolved",
        title: `${task.agentName} approval resolved`,
        body: `Approvals for "${task.title}" were resolved.`,
        includeSource: true,
      },
    );
  }

  const fresh = activeTaskForSession(userId, conversationId);

  if (
    fresh &&
    fresh.id === task.id &&
    fresh.state === "running" &&
    fresh.submissionId &&
    fresh.submissionId === row.clientMessageId &&
    !terminalTaskStates.has(fresh.state)
  ) {
    if (fresh.reminders < maxDelegateReminderTurns) {
      const clientMessageId = followupClientMessageId();

      if (
        enqueueCollabTurn({
          userId,
          conversationId,
          clientMessageId,
          text: `Your turn finished without reporting task "${fresh.title}". Call veykor_report_result now with your findings, or veykor_send_message if you need clarification.`,
        })
      ) {
        updateTask(userId, fresh.id, {
          reminders: fresh.reminders + 1,
          submissionId: clientMessageId,
        });
      }
    } else {
      transitionTask(
        userId,
        fresh.id,
        {
          state: "failed",
          error: "The delegate finished its turn without reporting a result.",
        },
        {
          type: "task-failed",
          title: `${fresh.agentName} did not report results`,
          body: `Task "${fresh.title}" failed: the delegate finished without calling veykor_report_result.`,
          responseRequired: true,
          includeSource: true,
        },
      );
    }

    return;
  }

  wakeSession(
    userId,
    parentId,
    conversationId,
    "Continue with the collaboration updates above.",
  );
}

export function taskIdFromClientMessage(clientMessageId: string): string {
  if (clientMessageId.startsWith("collab-task:")) {
    return clientMessageId.slice("collab-task:".length);
  }

  return "";
}

export function onQueueRowError(rowId: string) {
  const row = db
    .select()
    .from(chatInputs)
    .where(eq(chatInputs.id, rowId))
    .get();

  if (!row || row.state !== "error") {
    return;
  }

  const metadata = readConversation(row.userId, row.conversationId);

  if (!metadata?.parentConversationId) {
    return;
  }

  if (!row.clientMessageId.startsWith("collab-")) {
    return;
  }

  const parentId = metadata.parentConversationId;

  if (listParticipants(row.userId, parentId).length === 0) {
    return;
  }

  const taskId = taskIdFromClientMessage(row.clientMessageId);
  const task = taskId
    ? activeTaskForSession(row.userId, row.conversationId)
    : undefined;

  if (task && task.id === taskId && !terminalTaskStates.has(task.state)) {
    if (row.errorKind === "uncertain") {
      transitionTask(
        row.userId,
        task.id,
        {},
        {
          type: "task-state-changed",
          title: `${task.agentName} task outcome uncertain`,
          body: `Task "${task.title}" was running during a restart or disconnect. Its outcome is uncertain; the lead should check, stop, or re-delegate it. The task was not retried automatically.`,
          responseRequired: true,
          includeSource: true,
        },
      );
    } else {
      transitionTask(
        row.userId,
        task.id,
        {
          state: "failed",
          error: row.error || "The provider did not accept this task.",
        },
        {
          type: "task-failed",
          title: `${task.agentName} task failed`,
          body: `Task "${task.title}" failed: ${row.error || "the provider did not accept it."}`,
          responseRequired: true,
          includeSource: true,
        },
      );
    }
  }

  db.delete(chatInputs)
    .where(
      and(
        eq(chatInputs.userId, row.userId),
        eq(chatInputs.conversationId, row.conversationId),
        like(chatInputs.clientMessageId, "collab-%"),
        eq(chatInputs.state, "error"),
      ),
    )
    .run();

  cancelCollabRows(row.userId, row.conversationId);
  pauseQueue(row.userId, row.conversationId, false);
}
