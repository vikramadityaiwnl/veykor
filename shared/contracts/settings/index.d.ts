import type { ProviderCliStatus } from "../providers/index.js";
import type { ChatMessageBehavior, ChatPermissionMode, ChatProvider, ChatReasoningEffort } from "../chat/index.js";

export interface SettingsProvider extends ProviderCliStatus, ChatProvider {}

export interface SettingsResponse {
  providers: SettingsProvider[];
}

export interface GeneralPreferences {
  theme: "light" | "dark";
}

export interface ChatDefaults {
  messageBehavior: ChatMessageBehavior;
  defaultProviderId: string;
  models: Record<string, string>;
  efforts: Record<string, ChatReasoningEffort>;
  permissionMode: ChatPermissionMode;
}
