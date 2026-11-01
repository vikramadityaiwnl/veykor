import type { ChatReasoningEffort } from "@veykor/shared";

export const reasoningEffortTiers: ChatReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
];

export function isReasoningEffort(
  value: unknown,
): value is ChatReasoningEffort {
  return (
    typeof value === "string" &&
    (reasoningEffortTiers as string[]).includes(value)
  );
}
