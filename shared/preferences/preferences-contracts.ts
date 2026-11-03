import type { ChatPermission } from "../chats/chat-contracts.js";

export type SidebarTab = "chat" | "work";

export type InterruptionBehavior = "queue" | "steer";

export interface SidebarSection {
  id: string;
  title: string;
  open: boolean;
}

export interface CustomChat {
  id: string;
  title: string;
}

export interface PreferredModel {
  modelId: string;
  providerId: string;
}

export interface UserPreferences {
  lastTab: SidebarTab;
  sections: Array<SidebarSection>;
  workSections: Array<SidebarSection>;
  chatSections: Record<string, string>;
  chatTitles: Record<string, string>;
  customChats: Array<CustomChat>;
  removedChatIds: Array<string>;
  preferredModels: Record<SidebarTab, PreferredModel | null>;
  preferredEfforts: Record<SidebarTab, Record<string, string>>;
  preferredPermission: ChatPermission;
  interruptionBehavior: InterruptionBehavior;
}
