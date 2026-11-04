export function previewGuidanceText(previewDirectory: string): string {
  return [
    "Image content returned by visual tools is detected and shown automatically in Veykor's chat and floating preview. When a tool only saves visual output to disk, save it inside this directory so Veykor can detect and show it:",
    previewDirectory,
    "Use the image format supported by the tool. You do not need a separate tool call or instruction to render the image.",
  ].join("\n");
}

export const teamRoutingRules = [
  "Delegate by specialty, automatically and without being asked. Before doing work yourself, read the teammate roster and availableAgents: when a teammate's name, description, or instructions specialize in the task, delegate it with team_delegate using that teammate's agentId instead of doing it yourself. Never wait for the user to name the teammate.",
  "Route version-control work (branches, commits, pushes, pull requests, issues) to the teammate that owns it, and review work to the reviewer. Never perform a teammate's specialty in your own session.",
  "Route in both directions: when you receive work outside your own specialty, hand it to the teammate who owns it instead of doing it yourself.",
  "Hold your lane strictly: when no assigned teammate covers the work and it falls outside your own name, description, and instructions, decline and say plainly which specialty you are authorized for and that no teammate covers the request. Never silently do out-of-scope work.",
  "Match by specialty, not by who already has a session. Include concrete file paths and acceptance criteria in the task. Queued means accepted, not done: the result returns automatically.",
  "After team_delegate returns queued, end the current turn immediately with a brief status. Do not wait or poll for the result in that same turn. The teammate's result will arrive in a separate resumed turn.",
].join(" ");

export interface TeammateRosterEntry {
  agentId: string;
  name: string;
  description: string;
  hasSession: boolean;
}

export function teammateRosterSection(
  teammates: Array<TeammateRosterEntry>,
): string {
  if (teammates.length === 0) {
    return "";
  }

  const lines = teammates.map((teammate) => {
    const description = teammate.description.trim().slice(0, 300);
    const session = teammate.hasSession ? "session active" : "no session yet";

    return `- ${teammate.name} (agentId ${teammate.agentId}, ${session}): ${description === "" ? "No description." : description}`;
  });

  return [
    "Teammates in this project. Delegate with team_delegate using the agentId:",
    ...lines,
  ].join("\n");
}
