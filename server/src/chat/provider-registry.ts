import type { ChatProvider, ProviderCliId } from "@veykor/shared";
import type { NativeChatProvider } from "./native-chat-provider.js";
import { discoverModelCatalog } from "./model-catalog.js";
import { describeConversation, openConversation, runChat, setPermissionMode, decideApproval, stopConversation, isBusy, closeMuseSessions, releaseConversation } from "./muse-session-provider.js";

export interface ProviderDisplayMeta {
  label: string;
  company: string;
  cli: string;
}

export interface ProviderRegistration {
  meta: ProviderDisplayMeta;
  chat?: NativeChatProvider;
  discoverCatalog?: () => Promise<ChatProvider & { version: string }>;
}

const museChat: NativeChatProvider = {
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

const registry = new Map<ProviderCliId, ProviderRegistration>([
  [
    "muse",
    {
      meta: { label: "Muse Code", company: "Meta", cli: "muse" },
      chat: museChat,
      discoverCatalog: discoverModelCatalog,
    },
  ],
  [
    "opencode",
    {
      meta: { label: "OpenCode", company: "SST", cli: "opencode" },
    },
  ],
]);

export function knownProviderIds(): ProviderCliId[] {
  return [...registry.keys()];
}

export function registeredProviderIds(): ProviderCliId[] {
  return [...registry.entries()]
    .filter(([, entry]) => entry.chat !== undefined)
    .map(([id]) => id);
}

export function providerRegistration(
  providerId: string,
): ProviderRegistration | undefined {
  return registry.get(providerId as ProviderCliId);
}

export function chatProviderFor(
  providerId: string,
): NativeChatProvider | undefined {
  return providerRegistration(providerId)?.chat;
}

export async function closeChatProviders(): Promise<void> {
  const closers = [...registry.values()].flatMap((entry) =>
    entry.chat ? [entry.chat.close()] : [],
  );

  await Promise.all(closers);
}
