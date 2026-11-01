import type { ProviderCliStatus } from "../providers/index.js";
import type { ChatProvider } from "../chat/index.js";

export interface SettingsProvider extends ProviderCliStatus, ChatProvider {}

export interface SettingsResponse {
  providers: SettingsProvider[];
}

export interface GeneralPreferences {
  theme: "light" | "dark";
}
