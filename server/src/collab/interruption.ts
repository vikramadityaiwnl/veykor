import type { CollabSourceKind, CollabTask } from "@veykor/shared";
import { readConversation } from "../chat/conversations.js";
import { cancelCollabRows } from "../chat/collab-dispatch.js";
import { chatProviderFor } from "../providers/index.js";
import { activeTaskForSession, listTasks, readTask, terminalTaskStates, updateTask } from "./store.js";
import { agentNameFor } from "./sessions.js";
import { transitionTask, wakeSession } from "./tasks.js";
import { interruptConfirmMs } from "./limits.js";

export interface InterruptResult {
  task: CollabTask;
  alreadyTerminal: boolean;
}

export async function requestInterruption(
  input: {
    userId: number;
    taskId?: string;
    conversationId?: string;
    reason?: string;
    instructionText?: string;
    sourceKind: CollabSourceKind;
    sourceConversationId: string;
    sourceName: string;
  },
  options: { providerOps: boolean } = { providerOps: true },
): Promise<InterruptResult> {
  const task = input.taskId
    ? readTask(input.userId, input.taskId)
    : input.conversationId
      ? activeTaskForSession(input.userId, input.conversationId)
      : undefined;

  if (!task) {
    throw new Error("There is no active delegated task to stop");
  }

  if (terminalTaskStates.has(task.state)) {
    return { task, alreadyTerminal: true };
  }

  if (task.interruptState === "requested") {
    return { task, alreadyTerminal: false };
  }

  const reason = (input.reason || input.instructionText || "")
    .trim()
    .slice(0, 500);

  updateTask(input.userId, task.id, {
    interruptState: "requested",
    interruptReason: reason,
  });

  cancelCollabRows(input.userId, task.conversationId);

  const refreshed = readTask(input.userId, task.id)!;

  transitionTask(
    input.userId,
    task.id,
    {},
    {
      type: "interruption-requested",
      title: `Stopping ${task.agentName}…`,
      body: reason || `Interruption requested for "${task.title}".`,
      includeSource: input.sourceKind === "human",
      sourceKind: input.sourceKind,
      sourceConversationId: input.sourceConversationId,
      sourceName: input.sourceName,
    },
  );

  if (
    task.state === "queued" ||
    task.state === "blocked" ||
    !refreshed.submissionId
  ) {
    const confirmed = transitionTask(
      input.userId,
      task.id,
      {
        state: "interrupted",
        interruptState: "confirmed",
        resultIncomplete: true,
      },
      {
        type: "interruption-confirmed",
        title: `${task.agentName} stopped at your request`,
        body: `Task "${task.title}" was cancelled before it ran.`,
        responseRequired: true,
        includeSource: true,
        sourceKind: "system",
        sourceConversationId: task.parentConversationId,
        sourceName: agentNameFor(
          input.userId,
          task.parentConversationId,
          "Lead",
        ),
      },
    )!;

    wakeSession(
      input.userId,
      task.parentConversationId,
      task.parentConversationId,
      "Continue coordinating with the interruption update above.",
    );

    return { task: confirmed, alreadyTerminal: false };
  }

  if (!options.providerOps) {
    return { task: readTask(input.userId, task.id)!, alreadyTerminal: false };
  }

  const metadata = readConversation(input.userId, task.conversationId);
  const provider = metadata ? chatProviderFor(metadata.providerId) : undefined;

  try {
    if (provider?.isBusy(input.userId, task.conversationId)) {
      await provider.stop(input.userId, task.conversationId);
    }
  } catch {
    // Confirmation polling below reports the honest outcome.
  }

  const settled =
    !provider?.isBusy(input.userId, task.conversationId) &&
    (
      await provider
        ?.describe(input.userId, task.conversationId)
        .catch(() => undefined)
    )?.status !== "running";

  if (settled) {
    return { task: confirmTask(input.userId, task.id), alreadyTerminal: false };
  }

  return { task: readTask(input.userId, task.id)!, alreadyTerminal: false };
}

export function confirmTask(userId: number, taskId: string): CollabTask {
  const task = readTask(userId, taskId);

  if (!task || terminalTaskStates.has(task.state)) {
    return task!;
  }

  cancelCollabRows(userId, task.conversationId);

  return transitionTask(
    userId,
    task.id,
    {
      state: "interrupted",
      interruptState: "confirmed",
      resultIncomplete: true,
      resultPreview: task.resultPreview || partialFindingsNote(task),
    },
    {
      type: "interruption-confirmed",
      title: `${task.agentName} stopped`,
      body: `Task "${task.title}" was stopped. Its result is incomplete.`,
      responseRequired: true,
      includeSource: true,
    },
  )!;
}

function partialFindingsNote(task: CollabTask): string {
  return (
    task.resultPreview || "Partial work preserved in the delegate transcript."
  );
}

export async function settleInterruptions(
  userId: number,
  parentConversationId: string,
) {
  for (const task of listTasks(userId, parentConversationId)) {
    if (task.interruptState !== "requested") {
      continue;
    }

    const metadata = readConversation(userId, task.conversationId);
    const provider = metadata
      ? chatProviderFor(metadata.providerId)
      : undefined;

    if (!provider) {
      transitionTask(
        userId,
        task.id,
        { interruptState: "failed" },
        {
          type: "interruption-failed",
          title: `${task.agentName} could not be stopped`,
          body: `The provider for "${task.title}" is unavailable. Retry stopping it.`,
          responseRequired: true,
          includeSource: true,
        },
      );
      continue;
    }

    const snapshot = await provider
      .describe(userId, task.conversationId)
      .catch(() => undefined);

    const busy =
      provider.isBusy(userId, task.conversationId) ||
      snapshot?.status === "running";

    if (busy) {
      await provider.stop(userId, task.conversationId).catch(() => undefined);
    }

    const settled = await provider
      .describe(userId, task.conversationId)
      .catch(() => undefined);
    const stillBusy =
      provider.isBusy(userId, task.conversationId) ||
      settled?.status === "running";

    if (!stillBusy) {
      const confirmed = confirmTask(userId, task.id);

      void confirmed;

      wakeSession(
        userId,
        task.parentConversationId,
        task.parentConversationId,
        "Continue coordinating with the interruption update above.",
      );
      continue;
    }

    if (Date.now() - task.updatedAt > interruptConfirmMs * 4) {
      transitionTask(
        userId,
        task.id,
        { interruptState: "uncertain" },
        {
          type: "interruption-failed",
          title: `${task.agentName} may still be running`,
          body: `Stopping "${task.title}" is uncertain: the provider did not confirm within the expected time. Retry stopping it.`,
          responseRequired: true,
          includeSource: true,
        },
      );

      wakeSession(
        userId,
        task.parentConversationId,
        task.parentConversationId,
        "Continue coordinating with the interruption update above.",
      );
    }
  }
}
