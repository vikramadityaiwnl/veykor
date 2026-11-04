import type { ChatSummary } from "@veykor/shared";

export function projectChats(
  chats: Array<ChatSummary>,
  projectId: string,
): Array<ChatSummary> {
  return chats.filter((chat) => chat.projectId === projectId);
}

export function clearableProjectChats(
  chats: Array<ChatSummary>,
  projectId: string,
): Array<ChatSummary> {
  return projectChats(chats, projectId).filter((chat) => !chat.running);
}
