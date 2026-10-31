export type SidebarSectionKind = "chats" | "projects" | "custom";

export interface SidebarSection {
  id: string;
  title: string;
  kind: SidebarSectionKind;
  position: number;
  isExpanded: boolean;
  isFixed: boolean;
}

export interface SidebarSectionsResponse {
  sections: SidebarSection[];
}

export interface CreateSidebarSectionInput {
  title: string;
  kind: "chats" | "projects";
}

export interface UpdateSidebarSectionInput {
  title?: string;
  isExpanded?: boolean;
}
