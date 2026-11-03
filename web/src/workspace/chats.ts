export interface ChatPreview {
  id: string;
  title: string;
}

export const defaultChats: Array<ChatPreview> = [
  { id: "getting-started", title: "Getting started" },
  { id: "api-design", title: "API design" },
  { id: "debug-session", title: "Debug session" },
];
