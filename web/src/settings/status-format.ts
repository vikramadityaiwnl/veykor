const byteUnits = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const index = Math.min(
    byteUnits.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );

  const value = bytes / 1024 ** index;
  const rounded =
    value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;

  return `${rounded} ${byteUnits[index]}`;
}

export function formatLatency(latencyMs: number): string {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) {
    return "0 ms";
  }

  return `${Math.round(latencyMs * 10) / 10} ms`;
}
