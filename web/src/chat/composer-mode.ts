import type { InterruptionBehavior } from "@veykor/shared";

export type ComposerMode = "chat" | "project" | "teammate";

export function composerAction(
  running: boolean,
  hasInput: boolean,
  interruption: InterruptionBehavior,
): "stop" | "send" | "queue" | "steer" {
  if (running && !hasInput) {
    return "stop";
  }

  return running ? interruption : "send";
}
