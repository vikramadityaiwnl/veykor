import type { FoldedItem } from "./types.js";

interface ThoughtStream {
  accumulated: (itemId: string, field?: string) => string | undefined;
  accumulatedFields: (itemId: string) => readonly string[];
}

export function museThoughtText(
  item: FoldedItem,
  stream: ThoughtStream,
): string {
  const summaries = [...(item.summary || [])];

  if (item.status === "inProgress") {
    for (const field of stream.accumulatedFields(item.itemId)) {
      const match = /^summary\.(\d+)$/.exec(field);
      if (match) {
        summaries[Number(match[1])] =
          stream.accumulated(item.itemId, field) ||
          summaries[Number(match[1])] ||
          "";
      }
    }
  }

  const text =
    item.status === "inProgress"
      ? stream.accumulated(item.itemId) || item.text || ""
      : item.text || "";
  return [
    ...new Set([...summaries, text].filter((part) => part && part.trim())),
  ].join("\n\n");
}
