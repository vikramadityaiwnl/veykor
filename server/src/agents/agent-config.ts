import type { Agent, AgentSnapshot, ChatModel, ChatPermissionMode } from "@veykor/shared";

export const instructionOpenTag = "<veykor-agent-instructions>";
export const instructionCloseTag = "</veykor-agent-instructions>";

export function buildInstructionPrefix(instructions: string): string {
  const trimmed = instructions.trim();

  if (!trimmed) {
    return "";
  }

  return `${instructionOpenTag}\n${trimmed}\n${instructionCloseTag}\n\n`;
}

export function stripInstructionPrefix(text: string): string {
  const open = text.indexOf(instructionOpenTag);

  if (open === -1) {
    return text;
  }

  const close = text.indexOf(instructionCloseTag, open);

  if (close === -1) {
    return text;
  }

  return (text.slice(0, open) + text.slice(close + instructionCloseTag.length))
    .replace(/^\n+/, "")
    .trimStart();
}

export function isToolAllowed(
  snapshot: AgentSnapshot | null,
  toolName: string,
): boolean {
  if (!snapshot || snapshot.toolsMode === "unrestricted") {
    return true;
  }

  return snapshot.allowedTools.some((entry) => {
    if (entry.endsWith("*")) {
      return toolName.startsWith(entry.slice(0, -1));
    }

    return entry === toolName;
  });
}

export function denyChoiceId(
  choices: { choiceId: string; label: string; scope: string }[],
): string | undefined {
  const match = choices.find((choice) =>
    /deny|reject/i.test(`${choice.choiceId} ${choice.label} ${choice.scope}`),
  );

  return match?.choiceId;
}

export function agentCapabilityIssues(input: {
  providerId: string;
  permissionMode: ChatPermissionMode;
  mcpMode: string;
}): string[] {
  const issues: string[] = [];

  if (input.providerId === "opencode" && input.permissionMode === "onRequest") {
    issues.push(
      "OpenCode supports ask, deny, or full access. Choose Ask for approval instead of Approve for me.",
    );
  }

  if (input.providerId === "opencode" && input.mcpMode === "restricted") {
    issues.push(
      "OpenCode cannot limit MCP servers per conversation yet. Use unrestricted MCP access or choose Muse Code.",
    );
  }

  return issues;
}

export function resolveSnapshotEffort(
  agent: Agent,
  model: ChatModel | undefined,
): AgentSnapshot["reasoningEffort"] {
  const tiers = (model?.reasoningEfforts || []).map((option) => option.tier);

  if (agent.reasoningEffort && tiers.includes(agent.reasoningEffort)) {
    return agent.reasoningEffort;
  }

  if (model && tiers.includes(model.defaultReasoningEffort)) {
    return model.defaultReasoningEffort;
  }

  return tiers[0] || "max";
}

export function buildAgentSnapshot(
  agent: Agent,
  model: ChatModel | undefined,
): AgentSnapshot {
  return {
    agentId: agent.id,
    name: agent.name,
    providerId: agent.providerId,
    modelId: agent.modelId,
    reasoningEffort: resolveSnapshotEffort(agent, model),
    permissionMode: agent.permissionMode,
    instructions: agent.instructions,
    toolsMode: agent.toolsMode,
    allowedTools: [...agent.allowedTools],
    skillsMode: agent.skillsMode,
    skillIds: [...agent.skillIds],
    mcpMode: agent.mcpMode,
    mcpServerIds: [...agent.mcpServerIds],
  };
}

export function skillDirName(skillId: string): string {
  const separator = skillId.lastIndexOf("/");

  return separator === -1 ? skillId : skillId.slice(separator + 1);
}
