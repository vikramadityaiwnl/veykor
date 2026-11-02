export function responseSeconds(
  startedAt: number,
  finalRecordedAt: number,
  fallbackSeconds: number,
): number {
  if (
    !Number.isFinite(startedAt) ||
    startedAt <= 0 ||
    !Number.isFinite(finalRecordedAt) ||
    finalRecordedAt < startedAt
  ) {
    return fallbackSeconds;
  }

  return Math.max(1, Math.round((finalRecordedAt - startedAt) / 1000));
}
