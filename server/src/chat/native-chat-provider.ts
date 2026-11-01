import type { ChatRequest, ChatPermissionMode, ChatSession, ProviderCliId } from "@veykor/shared";

export interface NativeChatProvider {
  id: ProviderCliId;
  describe: (userId: number, id: string) => Promise<ChatSession | undefined>;
  open: (userId: number, id: string) => Promise<ChatSession | undefined>;
  runTurn: (userId: number, input: ChatRequest) => Promise<void>;
  setPermissionMode: (
    userId: number,
    conversationId: string,
    mode: ChatPermissionMode,
  ) => Promise<void>;
  decideApproval: (
    userId: number,
    conversationId: string,
    approvalId: string,
    choiceId: string,
  ) => Promise<void>;
  stop: (
    userId: number,
    conversationId: string,
    cancel?: boolean,
  ) => Promise<void>;
  isBusy: (userId: number, conversationId: string) => boolean;
  release: (userId: number, conversationId: string) => Promise<void>;
  close: () => Promise<void>;
}
