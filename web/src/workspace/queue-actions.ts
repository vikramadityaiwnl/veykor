import { useChatSessionsStore } from "./chat-sessions-store";

export async function queueAction(
  sessionId: string,
  messageId: string,
  action: "steer" | "edit" | "delete",
  text = "",
) {
  const path = `/api/chat/sessions/${encodeURIComponent(sessionId)}/queue/${encodeURIComponent(messageId)}`;
  const response = await fetch(action === "steer" ? `${path}/steer` : path, {
    method:
      action === "edit" ? "PATCH" : action === "delete" ? "DELETE" : "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Veykor-Request": "1" },
    ...(action === "edit" ? { body: JSON.stringify({ text }) } : {}),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "Unable to update queued message");
  }

  await useChatSessionsStore.getState().openSession(sessionId);
}
