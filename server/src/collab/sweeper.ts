import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatInputs, collabParticipants } from "../db/schema.js";
import { hasSubmittedMessages } from "../chat/message-queue.js";
import { chatProviderFor } from "../providers/index.js";
import { readConversation } from "../chat/conversations.js";
import { enqueueCollabTurn, hasPendingCollabRows } from "../chat/collab-dispatch.js";
import { listEvents, listParticipants, listTasks, readTask, terminalTaskStates, updateTask } from "./store.js";
import { settleInterruptions } from "./interruption.js";
import { briefingText, dependenciesMet, taskClientMessageId, taskPrompt, transitionTask, wakeSession } from "./tasks.js";
import { markReadThrough } from "./events.js";
import { sweeperIntervalMs } from "./limits.js";

let timer: NodeJS.Timeout | undefined;
let sweeping = false;

export function activeCollabParents(): {
  userId: number;
  parentConversationId: string;
}[] {
  return db
    .selectDistinct({
      userId: collabParticipants.userId,
      parentConversationId: collabParticipants.parentConversationId,
    })
    .from(collabParticipants)
    .all();
}

function hasUnsentRows(userId: number, conversationId: string): boolean {
  return !!db
    .select({ id: chatInputs.id })
    .from(chatInputs)
    .where(
      and(
        eq(chatInputs.userId, userId),
        eq(chatInputs.conversationId, conversationId),
        ne(chatInputs.state, "sent"),
      ),
    )
    .get();
}

function sessionIdle(userId: number, conversationId: string): boolean {
  const metadata = readConversation(userId, conversationId);

  if (!metadata) {
    return false;
  }

  const provider = chatProviderFor(metadata.providerId);

  if (!provider || provider.isBusy(userId, conversationId)) {
    return false;
  }

  return !hasUnsentRows(userId, conversationId);
}

export async function dispatchReadyTasks(
  userId: number,
  parentConversationId: string,
) {
  for (const task of listTasks(userId, parentConversationId)) {
    if (task.state !== "queued") {
      continue;
    }

    if (
      task.interruptState === "requested" ||
      task.interruptState === "confirmed"
    ) {
      continue;
    }

    const deps = dependenciesMet(userId, task);

    if (!deps.met) {
      const failed = deps.waitingOn
        .map((depId) => readTask(userId, depId))
        .find(
          (dep) =>
            dep &&
            terminalTaskStates.has(dep.state) &&
            dep.state !== "completed",
        );

      if (failed) {
        transitionTask(
          userId,
          task.id,
          {
            state: "blocked",
            blockedBy: `${failed.agentName} ${failed.state === "interrupted" ? "stopped" : failed.state}`,
          },
          {
            type: "task-state-changed",
            title: `${task.agentName} is blocked`,
            body: `Blocked: ${failed.agentName} ${failed.state === "interrupted" ? "stopped" : failed.state}. Task "${task.title}" cannot start.`,
            responseRequired: true,
            includeSource: true,
          },
        );
      }

      continue;
    }

    const metadata = readConversation(userId, task.conversationId);

    if (!metadata) {
      transitionTask(
        userId,
        task.id,
        { state: "failed", error: "The delegate session is gone." },
        {
          type: "task-failed",
          title: `${task.agentName} task failed`,
          body: `Task "${task.title}" failed: the delegate session is gone.`,
          responseRequired: true,
        },
      );
      continue;
    }

    const provider = chatProviderFor(metadata.providerId);

    if (!provider || provider.isBusy(userId, task.conversationId)) {
      continue;
    }

    if (hasPendingCollabRows(userId, task.conversationId)) {
      continue;
    }

    let text = taskPrompt(userId, parentConversationId, task);

    if (!hasSubmittedMessages(userId, task.conversationId)) {
      text = `${briefingText(userId, parentConversationId)}\n\n${text}`;

      markReadThrough(
        userId,
        parentConversationId,
        task.conversationId,
        currentMaxSeq(userId, parentConversationId),
      );
    }

    if (
      enqueueCollabTurn({
        userId,
        conversationId: task.conversationId,
        clientMessageId: taskClientMessageId(task.id),
        text,
      })
    ) {
      updateTask(userId, task.id, {
        state: "running",
        submissionId: taskClientMessageId(task.id),
      });
    }
  }
}

function currentMaxSeq(userId: number, parentConversationId: string): number {
  return listEvents(userId, parentConversationId).reduce(
    (max, event) => Math.max(max, event.seq),
    0,
  );
}

export async function pollDelegateApprovals(
  userId: number,
  parentConversationId: string,
) {
  for (const task of listTasks(userId, parentConversationId)) {
    if (terminalTaskStates.has(task.state)) {
      continue;
    }

    if (task.interruptState === "requested") {
      continue;
    }

    const metadata = readConversation(userId, task.conversationId);
    const provider = metadata
      ? chatProviderFor(metadata.providerId)
      : undefined;

    if (!provider) {
      continue;
    }

    const snapshot = await provider
      .describe(userId, task.conversationId)
      .catch(() => undefined);

    if (!snapshot) {
      continue;
    }

    const approvals = snapshot.approvals || [];

    if (approvals.length > 0 && task.state !== "waiting-for-approval") {
      transitionTask(
        userId,
        task.id,
        { state: "waiting-for-approval" },
        {
          type: "approval-needed",
          title: `${task.agentName} needs approval`,
          body: `Approval needed for "${task.title}". Open ${task.agentName} to review it.`,
          correlationId: `approval:${task.id}:${approvals[0].id}`,
          includeSource: true,
        },
      );
    } else if (
      approvals.length === 0 &&
      task.state === "waiting-for-approval"
    ) {
      transitionTask(
        userId,
        task.id,
        { state: "running" },
        {
          type: "approval-resolved",
          title: `${task.agentName} approval resolved`,
          body: `Approvals for "${task.title}" were resolved.`,
          correlationId: `approval-resolved:${task.id}:${Date.now()}`,
          includeSource: true,
        },
      );
    }
  }
}

export function sweepWakes(userId: number, parentConversationId: string) {
  for (const participant of listParticipants(userId, parentConversationId)) {
    if (!sessionIdle(userId, participant.conversationId)) {
      continue;
    }

    wakeSession(
      userId,
      parentConversationId,
      participant.conversationId,
      participant.role === "lead"
        ? "Continue coordinating the collaboration updates above and answer the user."
        : "Continue with the collaboration updates above.",
    );
  }
}

export async function sweepOnce() {
  if (sweeping) {
    return;
  }

  sweeping = true;

  try {
    for (const parent of activeCollabParents()) {
      await settleInterruptions(parent.userId, parent.parentConversationId);
      await dispatchReadyTasks(parent.userId, parent.parentConversationId);
      await pollDelegateApprovals(parent.userId, parent.parentConversationId);
      sweepWakes(parent.userId, parent.parentConversationId);
    }
  } catch (error) {
    console.error("Collaboration sweep failed", error);
  } finally {
    sweeping = false;
  }
}

export function startCollabSweeper() {
  clearInterval(timer);
  timer = setInterval(() => {
    void sweepOnce();
  }, sweeperIntervalMs);
  timer.unref();
}

export function stopCollabSweeper() {
  clearInterval(timer);
}
