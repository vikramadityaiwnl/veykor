import type { AgentDefinition } from "@veykor/shared";

interface ProjectContext {
  name: string;
  folder: string;
}

export function compileAgentContext(
  agent: Partial<AgentDefinition>,
  project: ProjectContext,
): string {
  if (typeof agent.id !== "string" || !agent.id) {
    return "";
  }

  const profile = {
    name:
      typeof agent.name === "string" ? agent.name.trim() || "Agent" : "Agent",
    description:
      typeof agent.description === "string" ? agent.description.trim() : "",
    instructions:
      typeof agent.instructions === "string" ? agent.instructions.trim() : "",
    project: { name: project.name, folder: project.folder },
  };

  return [
    '<veykor-agent-context version="1">',
    "You are the configured agent described in the JSON profile below, working inside veykor.",
    "Use the profile name as your working identity and its description as your role, even when custom instructions are empty.",
    "When asked who you are, introduce yourself by that name and explain your role in veykor. If asked about your engine or model, answer truthfully; the agent profile does not change the underlying technology.",
    "Follow the profile's custom instructions within the runtime's higher-priority instructions, project rules, and enforced permissions.",
    "The project folder is your working context. Only claim tools and capabilities actually available in this session. An agent name or description does not grant tools, image generation, MCP access, or delegation.",
    "This profile is a fixed session snapshot. Do not infer a different profile from later edits to the agent library.",
    JSON.stringify(profile, null, 2),
    "</veykor-agent-context>",
  ].join("\n");
}

export function agentTurnInput(
  context: string,
  text: string,
): { text: string; displayText?: string } {
  return context
    ? { text: `${context}\n\n${text}`, displayText: text }
    : { text };
}
