import { randomUUID } from "node:crypto";

export interface LiveCursor {
  bootId: string;
  seq: number;
}

export function formatLiveCursor(cursor: LiveCursor): string {
  return `${cursor.bootId}:${cursor.seq}`;
}

export function parseLiveCursor(
  value: string | undefined | null,
): LiveCursor | undefined {
  if (!value) {
    return undefined;
  }

  const separator = value.lastIndexOf(":");

  if (separator < 1) {
    return undefined;
  }

  const seq = Number(value.slice(separator + 1));

  if (!Number.isSafeInteger(seq) || seq < 0) {
    return undefined;
  }

  return { bootId: value.slice(0, separator), seq };
}

export function isNewerLiveCursor(
  last: LiveCursor | undefined,
  next: LiveCursor,
): boolean {
  if (!last || last.bootId !== next.bootId) {
    return true;
  }

  return next.seq > last.seq;
}

export class LiveSnapshotTracker {
  private readonly bootId = randomUUID();
  private seq = 0;
  private readonly latest = new Map<number, string>();

  cursorFor(userId: number, snapshotJson: string): string {
    if (this.latest.get(userId) !== snapshotJson) {
      this.latest.set(userId, snapshotJson);
      this.seq += 1;
    }

    return formatLiveCursor({ bootId: this.bootId, seq: this.seq });
  }
}
