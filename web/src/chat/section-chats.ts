import { recentSectionId } from "@veykor/shared";
import type { ChatSummary, SidebarSection } from "@veykor/shared";

export function resolveSectionId(
  sections: Array<SidebarSection>,
  chatSectionId: string,
): string {
  const known = new Set(sections.map((section) => section.id));

  if (known.has(chatSectionId)) {
    return chatSectionId;
  }

  if (known.has(recentSectionId)) {
    return recentSectionId;
  }

  return sections[0]?.id ?? "";
}

export function sectionChats(
  chats: Array<ChatSummary>,
  sections: Array<SidebarSection>,
  sectionId: string,
): Array<ChatSummary> {
  return chats.filter(
    (chat) =>
      !chat.projectId &&
      resolveSectionId(sections, chat.sectionId) === sectionId,
  );
}

export function clearableSectionChats(
  chats: Array<ChatSummary>,
  sections: Array<SidebarSection>,
  sectionId: string,
): Array<ChatSummary> {
  return sectionChats(chats, sections, sectionId).filter(
    (chat) => !chat.running,
  );
}
