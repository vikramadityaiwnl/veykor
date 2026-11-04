const messagePrefix = '<veykor-team-message version="1">';
const messageSuffix = "</veykor-team-message>";

interface Message {
  id: number;
  senderId: string;
  senderName: string;
  kind: string;
  text: string;
}

export function teamMessageInput(message: Message): string {
  return `${messagePrefix}\n${JSON.stringify(message)}\n${messageSuffix}`;
}

export function readTeamMessage(text: string): Message | null {
  const legacy =
    /^Team update #(\d+) \(([^)]+)\) from session ([0-9a-z-]+):\n([\s\S]*)$/i.exec(
      text,
    );

  if (legacy) {
    return {
      id: Number(legacy[1]),
      kind: legacy[2],
      senderId: legacy[3],
      senderName: "Teammate",
      text: legacy[4],
    };
  }

  if (!text.startsWith(messagePrefix) || !text.endsWith(messageSuffix)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      text.slice(messagePrefix.length, -messageSuffix.length),
    ) as Partial<Message>;

    return typeof parsed.text === "string" && typeof parsed.kind === "string"
      ? (parsed as Message)
      : null;
  } catch {
    return null;
  }
}
