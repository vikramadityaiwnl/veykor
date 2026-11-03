interface HistoryPage {
  events?: unknown;
  nextCursor?: unknown;
}

export async function readTurnDurations(
  readPage: (cursor: string) => Promise<HistoryPage>,
): Promise<Record<string, number>> {
  const durations: Record<string, number> = {};
  const cursors = new Set<string>();
  let cursor = "";

  while (!cursors.has(cursor)) {
    cursors.add(cursor);

    const page = await readPage(cursor);
    const events = Array.isArray(page.events) ? page.events : [];

    for (const event of events) {
      if (event.method !== "turn/completed") {
        continue;
      }

      const params = event.params;

      if (
        typeof params?.turnId === "string" &&
        typeof params.durationMs === "number" &&
        Number.isFinite(params.durationMs) &&
        params.durationMs > 0
      ) {
        durations[params.turnId] = params.durationMs;
      }
    }

    if (typeof page.nextCursor !== "string" || page.nextCursor === "") {
      break;
    }

    cursor = page.nextCursor;
  }

  return durations;
}
