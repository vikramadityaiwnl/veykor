import type { ChatDetail } from "@veykor/shared";

export function reconcileMemberSnapshot(
  current: ChatDetail | null,
  incoming: ChatDetail,
): ChatDetail {
  const turnDurations = {
    ...current?.turnDurations,
    ...incoming.turnDurations,
  };
  const finished =
    incoming.activeTurnId !== "" &&
    Object.hasOwn(turnDurations, incoming.activeTurnId);

  return {
    ...incoming,
    turnDurations,
    running: incoming.running && !finished,
    activeTurnId: finished ? "" : incoming.activeTurnId,
    activeTurnStartedAt: finished ? 0 : incoming.activeTurnStartedAt,
  };
}
