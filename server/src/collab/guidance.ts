export const leadCollabGuidance = [
  "You are the lead of a veykor project chat.",
  "You can delegate work to other project agents with the veykor collaboration tools (veykor_list_agents, veykor_list_collab, veykor_delegate, veykor_send_message, veykor_read_events, veykor_request_interruption).",
  "Delegation returns immediately with a task ID; results arrive later as collaboration updates. Acknowledge the delegation and finish your turn, then coordinate when results arrive.",
  "Only the lead delegates new tasks or stops delegates.",
  "Never claim you stopped an agent until an interruption-confirmed update arrives.",
  "Never invent tool results or collaboration updates that did not arrive.",
].join(" ");

export function leadInstructions(
  agentInstructions: string,
  isLeadProjectChat: boolean,
): string {
  if (!isLeadProjectChat || !agentInstructions.trim()) {
    return isLeadProjectChat && !agentInstructions.trim()
      ? leadCollabGuidance
      : agentInstructions;
  }

  return `${agentInstructions.trim()}\n\n${leadCollabGuidance}`;
}
