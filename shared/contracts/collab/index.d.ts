import type { AgentSnapshot } from "../agents/index.js";
import type { ChatAttachment, ChatSession } from "../chat/index.js";

export type CollabTaskState =
  | "queued"
  | "running"
  | "waiting-for-approval"
  | "waiting-for-reply"
  | "completed"
  | "interrupted"
  | "failed"
  | "blocked";

export type CollabInterruptState =
  "none" | "requested" | "confirmed" | "failed" | "uncertain";

export type CollabEventType =
  | "participant-joined"
  | "task-delegated"
  | "task-state-changed"
  | "human-instruction"
  | "clarification-requested"
  | "clarification-answered"
  | "progress-reported"
  | "result-reported"
  | "approval-needed"
  | "approval-resolved"
  | "interruption-requested"
  | "interruption-confirmed"
  | "interruption-failed"
  | "task-failed"
  | "message";

export type CollabMessageKind =
  "question" | "answer" | "progress" | "result" | "note" | "ack";

export type CollabSourceKind = "human" | "agent" | "system";

export type CollabDeliveryState = "queued" | "delivered" | "acked";

export interface CollabParticipant {
  id: string;
  parentConversationId: string;
  conversationId: string;
  agentId: string;
  agentName: string;
  role: "lead" | "delegate";
  status: "active" | "done";
  joinedAt: number;
  lastDeliveredSeq: number;
}

export interface CollabTask {
  id: string;
  parentConversationId: string;
  participantId: string;
  conversationId: string;
  agentId: string;
  agentName: string;
  title: string;
  instructions: string;
  expectedOutcome: string;
  context: string;
  state: CollabTaskState;
  waitingOn: string[];
  blockedBy: string;
  interruptState: CollabInterruptState;
  interruptReason: string;
  result: string;
  resultPreview: string;
  resultIncomplete: boolean;
  error: string;
  turnId: string;
  submissionId: string;
  reminders: number;
  createdByConversationId: string;
  createdAt: number;
  updatedAt: number;
}

export interface CollabEvent {
  id: string;
  parentConversationId: string;
  seq: number;
  type: CollabEventType;
  sourceKind: CollabSourceKind;
  sourceConversationId: string;
  sourceName: string;
  participantId: string;
  participantName: string;
  taskId: string;
  correlationId: string;
  title: string;
  body: string;
  taskState: CollabTaskState | "";
  responseRequired: boolean;
  createdAt: number;
}

export interface CollabDelivery {
  eventId: string;
  eventSeq: number;
  conversationId: string;
  participantName: string;
  state: CollabDeliveryState;
  updatedAt: number;
}

export interface CollabMessage {
  id: string;
  parentConversationId: string;
  fromConversationId: string;
  fromName: string;
  toConversationId: string;
  toName: string;
  taskId: string;
  kind: CollabMessageKind;
  text: string;
  correlationId: string;
  createdAt: number;
}

export interface CollabSnapshot {
  active: boolean;
  parentConversationId: string;
  projectId: string;
  participants: CollabParticipant[];
  tasks: CollabTask[];
  events: CollabEvent[];
  deliveries: CollabDelivery[];
  pendingByConversation: Record<string, number>;
  limits: {
    maxDelegates: number;
    maxTasks: number;
    maxEvents: number;
  };
}

export interface CollabSessionState {
  session: ChatSession;
  agentSnapshot: AgentSnapshot | null;
}

export interface CollabDetailResponse {
  snapshot: CollabSnapshot;
  sessions: CollabSessionState[];
}

export interface DelegateTaskInput {
  agentId: string;
  title: string;
  instructions: string;
  expectedOutcome?: string;
  context?: string;
  dependsOn?: string[];
}

export interface DelegateTaskResponse {
  taskId: string;
  conversationId: string;
  participantId: string;
  state: CollabTaskState;
  reusedSession: boolean;
}

export interface SendCollabMessageInput {
  to: string;
  kind: CollabMessageKind;
  text: string;
  taskId?: string;
  correlationId?: string;
}

export interface SendCollabMessageResponse {
  messageId: string;
  eventId: string;
  deliveredTo: string[];
  queuedFor: string[];
}

export interface ReportCollabResultInput {
  taskId: string;
  result: string;
  summary?: string;
}

export interface InterruptCollabTaskResponse {
  taskId: string;
  state: CollabTaskState;
  interruptState: CollabInterruptState;
  detail: string;
}

export interface CollabAttachmentReference {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ChatAttachment["kind"];
}
