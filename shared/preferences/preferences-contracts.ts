export type SidebarTab = "chat" | "work";

export interface SidebarSection {
  id: string;
  title: string;
  open: boolean;
}

export interface CustomChat {
  id: string;
  title: string;
}

export interface UserPreferences {
  lastTab: SidebarTab;
  sections: Array<SidebarSection>;
  chatSections: Record<string, string>;
  chatTitles: Record<string, string>;
  customChats: Array<CustomChat>;
  removedChatIds: Array<string>;
}
