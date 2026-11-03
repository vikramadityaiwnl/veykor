import type { ChatMode, ChatPermission } from "./chat-contracts.js";

export const chatPaths = {
  chats: "/api/chats",
  chat: (id: string) => `/api/chats/${id}`,
  events: (id: string) => `/api/chats/${id}/events`,
  turns: (id: string) => `/api/chats/${id}/turns`,
  cancelTurn: (id: string, turnId: string) =>
    `/api/chats/${id}/turns/${turnId}/cancel`,
  steer: (id: string) => `/api/chats/${id}/steer`,
  approvals: (id: string) => `/api/chats/${id}/approvals`,
  settings: (id: string) => `/api/chats/${id}/settings`,
  models: "/api/models",
} as const;

export const chatPermissions: Array<{
  value: ChatPermission;
  title: string;
  description: string;
}> = [
  {
    value: "read-only",
    title: "Read-only",
    description: "Chat only. The agent cannot run commands or edit files.",
  },
  {
    value: "approved",
    title: "Approved for me",
    description: "Auto-approves safe commands. Risky ones ask first.",
  },
  {
    value: "full-access",
    title: "Full access",
    description: "YOLO. The agent runs everything without asking.",
  },
];

export const chatModes: Array<{
  value: ChatMode;
  title: string;
  description: string;
}> = [
  {
    value: "chat",
    title: "Chat",
    description: "Ask questions and get answers.",
  },
  {
    value: "agent",
    title: "Agent",
    description: "Coming soon. The agent will work on your behalf.",
  },
];

export function defaultChatTitle(): string {
  return "Untitled chat";
}

export function preferredEffortKey(
  providerId: string,
  modelId: string,
): string {
  if (modelId === "") {
    return "default";
  }

  return providerId === "" ? modelId : `${providerId}:${modelId}`;
}

export function permissionTitle(permission: ChatPermission): string {
  return (
    chatPermissions.find((entry) => entry.value === permission)?.title ??
    "Read-only"
  );
}

export function modelDisplayName(
  modelId: string,
  displayLabel: string,
): string {
  if (displayLabel !== "" && displayLabel !== modelId) {
    return displayLabel;
  }

  return modelId
    .split("-")
    .map((part) => {
      if (part === "" || /^\d/.test(part)) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
