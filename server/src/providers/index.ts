import type { ChatProvider, ProviderCliId } from "@veykor/shared";
import type { ChatRuntimeProvider } from "./provider.js";
import { detectMuseCLI, detectOpencodeCLI, type CliProbe } from "./detection.js";
import { discoverModelCatalog } from "./muse/models.js";
import { discoverOpencodeCatalog } from "./opencode/models.js";
import { opencodeProvider } from "./opencode/provider.js";
import { museProvider } from "./muse/provider.js";

export interface ProviderDisplayMeta {
  label: string;
  company: string;
  cli: string;
}

export interface ProviderRegistration {
  meta: ProviderDisplayMeta;
  chat?: ChatRuntimeProvider;
  discoverCatalog?: () => Promise<ChatProvider>;
  detectCLI: () => Promise<CliProbe>;
}

const registry = new Map<ProviderCliId, ProviderRegistration>([
  [
    "muse",
    {
      meta: { label: "Muse Code", company: "Meta", cli: "muse" },
      chat: museProvider,
      discoverCatalog: discoverModelCatalog,
      detectCLI: detectMuseCLI,
    },
  ],
  [
    "opencode",
    {
      meta: { label: "OpenCode", company: "Anomaly", cli: "opencode" },
      chat: opencodeProvider,
      discoverCatalog: discoverOpencodeCatalog,
      detectCLI: detectOpencodeCLI,
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
): ChatRuntimeProvider | undefined {
  return providerRegistration(providerId)?.chat;
}

export async function closeChatProviders(): Promise<void> {
  const closers = [...registry.values()].flatMap((entry) =>
    entry.chat ? [entry.chat.close()] : [],
  );

  await Promise.all(closers);
}
