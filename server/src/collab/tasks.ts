import { randomUUID } from "node:crypto";
import type { CollabEvent, CollabMessageKind, CollabTask, CollabTaskState } from "@veykor/shared";
import { readConversation } from "../chat/conversations.js";
import { listAgentsForProject } from "../agents/store.js";
import { activeTaskForSession, insertMessage, insertTask, listEvents, listParticipants, listTasks, readParticipant, readTask, terminalTaskStates, updateTask } from "./store.js";
import { buildDigest, publishEvent, shouldWakeRecipient } from "./events.js";
import { agentNameFor, ensureDelegateSession, resolveDelegateAgent, type DelegateCatalog } from "./sessions.js";
import { maxMessageText, maxResultChars, maxTaskInstructions, maxTasksPerChat, maxTaskTitle } from "./limits.js";
import { enqueueCollabTurn } from "../chat/collab-dispatch.js";

export function taskClientMessageId(taskId: string): string {
  return `collab-task:${taskId}`;
}

export function wakeClientMessageId(
  conversationId: string,
  maxSeq: number,
): string {
  return `collab-wake:${conversationId}:${maxSeq}`;
}

export function followupClientMessageId(): string {
  return `collab-followup:${randomUUID()}`;
}

function preview(text: string, length: number): string {
  const clean = text.replace(/\s+/g, " ").trim();

  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}

export async function delegateTask(input: {
  userId: number;
  parentConversationId: string;
  callerConversationId: string;
  agentId: string;
  title: string;
  instructions: string;
  expectedOutcome?: string;
  context?: string;
  dependsOn?: string[];
  catalog?: DelegateCatalog;
}): Promise<{ task: CollabTask; reusedSession: boolean }> {
  if (input.callerConversationId !== input.parentConversationId) {
    throw new Error("Only the lead can delegate new tasks");
  }

  const parent = readConversation(input.userId, input.parentConversationId);

  if (!parent || parent.parentConversationId || !parent.projectId) {
    throw new Error("Conversation not found");
  }

  const title = input.title.trim();
  const instructions = input.instructions.trim();

  if (!title || title.length > maxTaskTitle) {
    throw new Error("Give the task a short title");
  }

  if (!instructions || instructions.length > maxTaskInstructions) {
    throw new Error("Describe the task in at most 20,000 characters");
  }

  if (
    listTasks(input.userId, input.parentConversationId).length >=
    maxTasksPerChat
  ) {
    throw new Error("This chat reached its task limit");
  }

  const agent = resolveDelegateAgent(
    input.userId,
    input.parentConversationId,
    input.agentId,
  );

  const dependsOn = [...new Set(input.dependsOn || [])].filter(Boolean);

  for (const depId of dependsOn) {
    const dep = readTask(input.userId, depId);

    if (!dep || dep.parentConversationId !== input.parentConversationId) {
      throw new Error("A dependency does not belong to this chat");
    }

    if (dep.conversationId && dep.agentId === agent.id) {
      throw new Error("A task cannot depend on the same delegate");
    }
  }

  const session = await ensureDelegateSession(
    input.userId,
    input.parentConversationId,
    agent,
    input.catalog,
  );

  const leadName = agentNameFor(
    input.userId,
    input.parentConversationId,
    "Lead",
  );

  if (!session.reusedSession) {
    publishEvent({
      userId: input.userId,
      parentConversationId: input.parentConversationId,
      type: "participant-joined",
      sourceKind: "system",
      sourceConversationId: input.parentConversationId,
      sourceName: leadName,
      participantId: session.participantId,
      participantName: agent.name,
      title: `${agent.name} joined the collaboration`,
      body: "",
    });
  }

  const task = insertTask({
    userId: input.userId,
    parentConversationId: input.parentConversationId,
    participantId: session.participantId,
    conversationId: session.conversationId,
    agentId: agent.id,
    agentName: agent.name,
    title,
    instructions,
    expectedOutcome: (input.expectedOutcome || "").trim().slice(0, 2000),
    context: (input.context || "").trim().slice(0, maxTaskInstructions),
    waitingOn: dependsOn,
    createdByConversationId: input.callerConversationId,
  });

  publishEvent({
    userId: input.userId,
    parentConversationId: input.parentConversationId,
    type: "task-delegated",
    sourceKind: "agent",
    sourceConversationId: input.parentConversationId,
    sourceName: leadName,
    participantId: session.participantId,
    participantName: agent.name,
    taskId: task.id,
    correlationId: `delegate:${task.id}`,
    title: `Delegated to ${agent.name} — ${preview(title, 80)}`,
    body: preview(instructions, 300),
    taskState: task.state,
    responseRequired: true,
  });

  return { task, reusedSession: session.reusedSession };
}

export function taskPrompt(
  userId: number,
  parentConversationId: string,
  task: CollabTask,
): string {
  const leadName = agentNameFor(userId, parentConversationId, "Lead");

  return [
    `[veykor delegation — task "${task.title}" from ${leadName}]`,
    "",
    task.instructions,
    "",
    `Expected outcome: ${task.expectedOutcome || "Report your findings via veykor_report_result."}`,
    task.context ? "" : "",
    task.context ? `Task context: ${task.context}` : "",
    "",
    `You are ${task.agentName}, working as a delegate in a veykor collaboration led by ${leadName}.`,
    "Use veykor_report_progress sparingly for meaningful progress.",
    "Use veykor_send_message to ask a clarifying question; your task pauses until it is answered.",
    "When finished, call veykor_report_result exactly once. The task is not done until you call it.",
    "Use veykor_read_events to catch up on shared collaboration state.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function briefingText(
  userId: number,
  parentConversationId: string,
): string {
  const tasks = listTasks(userId, parentConversationId);
  const events = listEvents(userId, parentConversationId).slice(-20);

  const lines = [
    "[veykor collaboration briefing — shared state before your first task]",
  ];

  if (tasks.length > 0) {
    lines.push("Tasks:");

    for (const task of tasks.slice(-15)) {
      const extra =
        task.state === "completed" && task.resultPreview
          ? ` — result: ${preview(task.resultPreview, 200)}`
          : task.state === "failed" || task.state === "interrupted"
            ? ` — ${preview(task.error || task.resultPreview || "incomplete", 200)}`
            : "";

      lines.push(
        `- ${task.agentName}: "${task.title}" [${task.state}]${extra}`,
      );
    }
  }

  if (events.length > 0) {
    lines.push("Recent events:");

    for (const event of events) {
      lines.push(
        `- [${event.type}] ${preview(event.title, 120)}${event.body ? `: ${preview(event.body, 160)}` : ""}`,
      );
    }
  }

  lines.push("[End of briefing.]");

  return lines.join("\n");
}

export function transitionTask(
  userId: number,
  taskId: string,
  patch: Parameters<typeof updateTask>[2],
  event?: {
    type: CollabEvent["type"];
    title: string;
    body: string;
    responseRequired?: boolean;
    correlationId?: string;
    includeSource?: boolean;
    sourceKind?: CollabEvent["sourceKind"];
    sourceConversationId?: string;
    sourceName?: string;
  },
): CollabTask | undefined {
  const task = updateTask(userId, taskId, patch);

  if (!task) {
    return undefined;
  }

  if (event) {
    publishEvent({
      userId,
      parentConversationId: task.parentConversationId,
      type: event.type,
      sourceKind: event.sourceKind || "system",
      sourceConversationId:
        event.sourceConversationId || task.parentConversationId,
      sourceName:
        event.sourceName ||
        agentNameFor(userId, task.parentConversationId, "Lead"),
      participantId: task.participantId,
      participantName: task.agentName,
      taskId: task.id,
      correlationId: event.correlationId,
      title: event.title,
      body: event.body,
      taskState: task.state,
      responseRequired: event.responseRequired || false,
      includeSource: event.includeSource || false,
    });
  }

  if (patch.state && terminalTaskStates.has(patch.state)) {
    blockDependents(userId, task);
  }

  return task;
}

function blockDependents(userId: number, task: CollabTask) {
  if (task.state === "completed") {
    return;
  }

  for (const sibling of listTasks(userId, task.parentConversationId)) {
    if (
      sibling.state === "queued" &&
      sibling.waitingOn.includes(task.id) &&
      !terminalTaskStates.has(sibling.state)
    ) {
      transitionTask(
        userId,
        sibling.id,
        {
          state: "blocked",
          blockedBy: `${task.agentName} ${task.state === "interrupted" ? "stopped" : task.state}`,
        },
        {
          type: "task-state-changed",
          title: `${sibling.agentName} is blocked`,
          body: `Blocked: ${task.agentName} ${task.state === "interrupted" ? "stopped" : task.state}. Task "${sibling.title}" cannot start.`,
          responseRequired: true,
          includeSource: true,
        },
      );
    }
  }
}

export function dependenciesMet(
  userId: number,
  task: CollabTask,
): { met: boolean; waitingOn: string[] } {
  const waitingOn: string[] = [];

  for (const depId of task.waitingOn) {
    const dep = readTask(userId, depId);

    if (!dep || dep.state !== "completed") {
      waitingOn.push(depId);
    }
  }

  return { met: waitingOn.length === 0, waitingOn };
}

export function waitingLabel(userId: number, task: CollabTask): string {
  const names = task.waitingOn
    .map((depId) => readTask(userId, depId)?.agentName || "")
    .filter(Boolean);

  return names.length > 0 ? `Waiting for ${names.join(", ")}` : "";
}

export function resolveMessageRecipient(
  userId: number,
  parentConversationId: string,
  callerConversationId: string,
  to: string,
): { conversationId: string; name: string; broadcast: boolean } {
  const needle = to.trim().toLowerCase();

  if (!needle || needle === "all" || needle === "everyone") {
    return { conversationId: "", name: "Everyone", broadcast: true };
  }

  const participants = listParticipants(userId, parentConversationId);

  if (needle === "lead") {
    const lead = participants.find((entry) => entry.role === "lead");

    if (!lead) {
      throw new Error("This chat has no lead participant yet");
    }

    return {
      conversationId: lead.conversationId,
      name: lead.agentName,
      broadcast: false,
    };
  }

  const match = participants.filter(
    (entry) =>
      entry.agentName.toLowerCase() === needle &&
      entry.conversationId !== callerConversationId,
  );

  if (match.length === 1) {
    return {
      conversationId: match[0].conversationId,
      name: match[0].agentName,
      broadcast: false,
    };
  }

  if (match.length > 1) {
    throw new Error(`"${to}" matches more than one participant`);
  }

  const available = listAgentsForProject(
    userId,
    readConversation(userId, parentConversationId)?.projectId || "",
  ).find((agent) => agent.name.toLowerCase() === needle);

  if (available) {
    throw new Error(
      `${available.name} has not joined this collaboration yet. The lead can delegate a task to add them.`,
    );
  }

  throw new Error(`"${to}" does not match any participant in this chat`);
}

export function sendCollabMessage(input: {
  userId: number;
  parentConversationId: string;
  callerConversationId: string;
  callerName: string;
  callerKind: CollabEvent["sourceKind"];
  to: string;
  kind: CollabMessageKind;
  text: string;
  taskId?: string;
  correlationId?: string;
}): { messageId: string; event: CollabEvent } {
  const text = input.text.trim();

  if (!text || text.length > maxMessageText) {
    throw new Error("Write a message of at most 20,000 characters");
  }

  const recipient = resolveMessageRecipient(
    input.userId,
    input.parentConversationId,
    input.callerConversationId,
    input.to,
  );

  const task = input.taskId
    ? readTask(input.userId, input.taskId)
    : activeTaskForSession(input.userId, input.callerConversationId);

  if (task && task.parentConversationId !== input.parentConversationId) {
    throw new Error("That task does not belong to this chat");
  }

  const message = insertMessage({
    userId: input.userId,
    parentConversationId: input.parentConversationId,
    fromConversationId: input.callerConversationId,
    fromName: input.callerName,
    toConversationId: recipient.conversationId,
    toName: recipient.name,
    taskId: task?.id || "",
    kind: input.kind,
    text,
    correlationId: input.correlationId,
  });

  const recipientParticipant = recipient.broadcast
    ? undefined
    : readParticipant(
        input.userId,
        input.parentConversationId,
        recipient.conversationId,
      );

  const type: CollabEvent["type"] =
    input.kind === "question"
      ? "clarification-requested"
      : input.kind === "answer"
        ? "clarification-answered"
        : input.kind === "progress"
          ? "progress-reported"
          : "message";

  const responseRequired =
    !recipient.broadcast &&
    (input.kind === "question" || input.kind === "answer");

  const event = publishEvent({
    userId: input.userId,
    parentConversationId: input.parentConversationId,
    type,
    sourceKind: input.callerKind,
    sourceConversationId: input.callerConversationId,
    sourceName: input.callerName,
    participantId: recipientParticipant?.id || "",
    participantName: recipient.broadcast ? "" : recipient.name,
    taskId: task?.id || "",
    correlationId: `message:${message.id}`,
    title:
      input.kind === "question"
        ? `${input.callerName} asked ${recipient.name}`
        : input.kind === "answer"
          ? `${input.callerName} answered ${recipient.name}`
          : `${input.callerName} messaged ${recipient.name}`,
    body: preview(text, 500),
    taskState: task?.state || "",
    responseRequired,
  });

  if (
    input.kind === "question" &&
    task &&
    !terminalTaskStates.has(task.state)
  ) {
    transitionTask(userIdSafe(input.userId), task.id, {
      state: "waiting-for-reply",
    });
  }

  if (
    input.kind === "answer" &&
    !recipient.broadcast &&
    recipient.conversationId !== input.parentConversationId
  ) {
    const waiting = activeTaskForSession(
      input.userId,
      recipient.conversationId,
    );

    if (waiting && waiting.state === "waiting-for-reply") {
      transitionTask(input.userId, waiting.id, { state: "running" });
      wakeSession(
        input.userId,
        input.parentConversationId,
        recipient.conversationId,
        `Continue your task "${waiting.title}" with the answer above.`,
      );
    }
  }

  if (
    responseRequired &&
    !recipient.broadcast &&
    recipient.conversationId !== input.callerConversationId
  ) {
    wakeSession(
      input.userId,
      input.parentConversationId,
      recipient.conversationId,
      input.kind === "question"
        ? "Answer the question above."
        : "Continue with the update above.",
    );
  }

  return { messageId: message.id, event };
}

function userIdSafe(userId: number): number {
  return userId;
}

export function reportProgress(input: {
  userId: number;
  parentConversationId: string;
  callerConversationId: string;
  callerName: string;
  taskId: string;
  text: string;
}): CollabEvent {
  const task = readTask(input.userId, input.taskId);

  if (!task || task.parentConversationId !== input.parentConversationId) {
    throw new Error("Task not found in this chat");
  }

  if (task.conversationId !== input.callerConversationId) {
    throw new Error("Only the working delegate reports progress for a task");
  }

  if (terminalTaskStates.has(task.state)) {
    throw new Error(`This task already ${task.state}`);
  }

  const text = input.text.trim().slice(0, 5000);

  if (!text) {
    throw new Error("Describe the progress");
  }

  return publishEvent({
    userId: input.userId,
    parentConversationId: input.parentConversationId,
    type: "progress-reported",
    sourceKind: "agent",
    sourceConversationId: input.callerConversationId,
    sourceName: input.callerName,
    participantId: task.participantId,
    participantName: task.agentName,
    taskId: task.id,
    title: `${task.agentName} reported progress`,
    body: preview(text, 500),
    taskState: task.state,
    responseRequired: false,
  });
}

export function reportResult(input: {
  userId: number;
  parentConversationId: string;
  callerConversationId: string;
  callerName: string;
  taskId: string;
  result: string;
  summary?: string;
}): CollabTask {
  const task = readTask(input.userId, input.taskId);

  if (!task || task.parentConversationId !== input.parentConversationId) {
    throw new Error("Task not found in this chat");
  }

  if (task.conversationId !== input.callerConversationId) {
    throw new Error("Only the working delegate reports the result");
  }

  if (terminalTaskStates.has(task.state)) {
    throw new Error(`This task already ${task.state}`);
  }

  const result = input.result.trim().slice(0, maxResultChars);

  if (!result) {
    throw new Error("Report the findings");
  }

  const summary = (input.summary || "").trim().slice(0, 1000);

  const updated = transitionTask(
    input.userId,
    task.id,
    {
      state: "completed",
      result,
      resultPreview: summary || preview(result, 500),
      resultIncomplete: false,
      error: "",
    },
    {
      type: "result-reported",
      title: `${task.agentName} returned findings`,
      body: summary || preview(result, 500),
      responseRequired: true,
      sourceKind: "agent",
      sourceConversationId: input.callerConversationId,
      sourceName: input.callerName,
    },
  )!;

  wakeSession(
    input.userId,
    input.parentConversationId,
    input.parentConversationId,
    `Coordinate the completed work above and answer the user.`,
  );

  return updated;
}

export function wakeSession(
  userId: number,
  parentConversationId: string,
  conversationId: string,
  directive: string,
): boolean {
  const digest = buildDigest(userId, parentConversationId, conversationId);
  const pending = digest.eventIds.length;

  if (pending === 0) {
    return false;
  }

  const participantEvents = digest.eventIds
    .map((id) => pendingEventById(userId, parentConversationId, id))
    .filter((event): event is CollabEvent => !!event);

  const actionable = participantEvents.some((event) =>
    shouldWakeRecipient(userId, parentConversationId, event, conversationId),
  );

  if (!actionable) {
    return false;
  }

  const metadata = readConversation(userId, conversationId);

  if (!metadata) {
    return false;
  }

  return enqueueCollabTurn({
    userId,
    conversationId,
    clientMessageId: wakeClientMessageId(conversationId, digest.maxSeq),
    text: directive,
  });
}

function pendingEventById(
  userId: number,
  parentConversationId: string,
  eventId: string,
): CollabEvent | undefined {
  return listEvents(userId, parentConversationId).find(
    (event) => event.id === eventId,
  );
}

export function currentStateSummary(
  userId: number,
  parentConversationId: string,
): string {
  const tasks = listTasks(userId, parentConversationId);
  const participants = listParticipants(userId, parentConversationId);

  const lines = [
    `Participants: ${participants.map((entry) => `${entry.agentName} (${entry.role})`).join(", ") || "none"}`,
  ];

  for (const task of tasks) {
    lines.push(
      `- ${task.agentName}: "${task.title}" [${task.state}]${task.waitingOn.length > 0 ? ` waiting on ${task.waitingOn.length} task(s)` : ""}${task.resultPreview ? ` — ${preview(task.resultPreview, 160)}` : ""}`,
    );
  }

  return lines.join("\n");
}

export function leadOutstandingTasks(
  userId: number,
  parentConversationId: string,
): CollabTask[] {
  return listTasks(userId, parentConversationId).filter(
    (task) =>
      !terminalTaskStates.has(task.state) &&
      task.createdByConversationId === parentConversationId,
  );
}

export function describeTaskState(state: CollabTaskState): string {
  switch (state) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "waiting-for-approval":
      return "needs approval";
    case "waiting-for-reply":
      return "waiting for reply";
    case "completed":
      return "completed";
    case "interrupted":
      return "stopped";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
  }
}
