import type { NativeChatProvider } from "./native-chat-provider.js";
import { describeConversation, openConversation, runChat, setPermissionMode, decideApproval, stopConversation, isBusy, closeMuseSessions, permissionModes, releaseConversation } from "./muse-session-provider.js";

export { validChatRequest } from "./chat-validation.js";
export { permissionModes };

export const chatProvider: NativeChatProvider = {
  id: "muse",
  describe: describeConversation,
  open: openConversation,
  runTurn: runChat,
  setPermissionMode,
  decideApproval,
  stop: stopConversation,
  isBusy,
  release: releaseConversation,
  close: closeMuseSessions,
};
