export type ChatPermission = "read-only" | "approved" | "full-access";

export type ChatMode = "chat" | "agent";

export interface ChatSummary {
  id: string;
  title: string;
  sectionId: string;
  museSessionId: string;
  running: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatImageAttachment {
  mediaType: string;
}

export interface ChatHistoryItem {
  itemId: string;
  kind: string;
  status: string;
  turnId: string | null;
  text: string;
  summary: Array<string>;
  tool: string;
  displayLabel: string;
  visibleOutput: string;
  args: string;
  recordedAt: string;
  attachments: Array<ChatImageAttachment>;
}

export interface ChatApprovalChoice {
  choiceId: string;
  label: string;
  decision: string;
  scope: string;
  acceptsFeedback: boolean;
  rulePreview: string;
}

export interface ChatApprovalRequest {
  approvalId: string;
  sessionId: string;
  turnId: string;
  itemId: string;
  toolName: string;
  rawArgs: string;
  subjectKind: string;
  subjectTitle: string;
  requirementIndex: number;
  choices: Array<ChatApprovalChoice>;
}

export interface ChatDetail {
  activeTurnId: string;
  activeTurnStartedAt: number;
  running: boolean;
  turnDurations: Record<string, number>;
  chat: ChatSummary;
  items: Array<ChatHistoryItem>;
  pendingApprovals: Array<ChatApprovalRequest>;
  modelId: string;
  providerId: string;
  reasoningEffort: string;
  permission: ChatPermission;
}

export interface ChatModelCost {
  input: string;
  cached: string;
  output: string;
  currency: string;
}

export interface ChatModelOption {
  modelId: string;
  providerId: string;
  displayLabel: string;
  description: string;
  cost: ChatModelCost | null;
  variants: Array<string>;
  defaultReasoningEffort: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface ChatModelCatalog {
  providerId: string;
  source: string;
  models: Array<ChatModelOption>;
}

export interface CreateChatRequest {
  sectionId?: string;
  title?: string;
}

export interface UpdateChatRequest {
  title?: string;
  sectionId?: string;
}

export interface ChatImageInput {
  mediaType: string;
  base64Data: string;
}

export interface StartTurnRequest {
  text: string;
  images?: Array<ChatImageInput>;
}

export interface SteerTurnRequest {
  text: string;
  expectedTurnId: string;
  images?: Array<ChatImageInput>;
}

export interface DecideApprovalRequest {
  approvalId: string;
  choiceId: string;
  feedback?: string;
}

export interface UpdateChatSettingsRequest {
  modelId?: string;
  providerId?: string;
  reasoningEffort?: string;
  permission?: ChatPermission;
}
