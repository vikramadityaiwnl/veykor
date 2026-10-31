import type { ChatSession } from "@veykor/shared";

export function validChatSessions(
  value: unknown,
): value is { sessions: ChatSession[] } {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { sessions: unknown }).sessions)
  ) {
    return false;
  }
  const sessions = (value as { sessions: ChatSession[] }).sessions;

  return (
    sessions.length <= 500 &&
    new Set(sessions.map((session) => session?.id)).size === sessions.length &&
    sessions.every(
      (session) =>
        session &&
        typeof session.id === "string" &&
        session.id.length > 0 &&
        session.id.length <= 100 &&
        typeof session.title === "string" &&
        session.title.length <= 200 &&
        (session.projectId === null || typeof session.projectId === "string") &&
        (session.sectionId === null || typeof session.sectionId === "string") &&
        typeof session.providerId === "string" &&
        session.providerId.length <= 100 &&
        typeof session.modelId === "string" &&
        session.modelId.length <= 200 &&
        Array.isArray(session.messages) &&
        session.messages.length > 0 &&
        session.messages.length <= 200 &&
        session.messages.every(
          (message) =>
            message &&
            typeof message.id === "string" &&
            ["user", "assistant"].includes(message.role) &&
            typeof message.text === "string" &&
            message.text.length <= 100_000 &&
            message.usage &&
            [
              message.usage.inputTokens,
              message.usage.outputTokens,
              message.usage.cost,
            ].every(
              (number) =>
                typeof number === "number" &&
                Number.isFinite(number) &&
                number >= 0,
            ) &&
            typeof message.usage.costAvailable === "boolean",
        ),
    )
  );
}
