export interface FoldedItem {
  itemId: string;
  commandId?: string;
  turnId?: string;
  kind: string;
  status: string;
  recordedAt?: string;
  text?: string;
  summary?: string[];
  statusLine?: string;
  fallbackText?: string;
  tool?: string;
  args?: string;
  visibleOutput?: string;
  failureReason?: string;
  messagePhase?: string;
  retracted?: boolean;
  revision?: number;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ApprovalDecisionInput {
  choiceId: string;
  onApplied?: () => void;
  onError?: (error: Error) => void;
}

export interface ApprovalRequest {
  sessionId: string;
  approvalId: string;
  currentRequirementId: { approvalId: string; sourceIndex: number };
  toolName: string;
  rawArgs: string;
  availableChoices: {
    choiceId: string;
    label: string;
    scope: string;
    rulePreview?: string;
  }[];
}

export type { MuseSession as Session } from "./session.js";
