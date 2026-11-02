import type { CreateAgentInput } from "@veykor/shared";
import { isReasoningEffort } from "../providers/reasoning-effort.js";
import { agentCapabilityIssues } from "./agent-config.js";

const providerIds = ["muse", "opencode"];
const permissionModes = [
  "promptUnmatched",
  "onRequest",
  "denyUnmatched",
  "allowAll",
];
const modelPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:@+/-]{0,199}$/;
const toolPattern = /^[A-Za-z0-9][A-Za-z0-9_.:*-]{0,79}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

function validIdList(value: unknown, max: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every(
      (entry) => typeof entry === "string" && idPattern.test(entry),
    ) &&
    new Set(value).size === value.length
  );
}

export function validAgentInput(value: unknown): value is CreateAgentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const input = value as CreateAgentInput;

  return (
    typeof input.name === "string" &&
    input.name.trim().length > 0 &&
    input.name.trim().length <= 80 &&
    typeof input.description === "string" &&
    input.description.length <= 500 &&
    typeof input.instructions === "string" &&
    input.instructions.length <= 20_000 &&
    providerIds.includes(input.providerId) &&
    typeof input.modelId === "string" &&
    modelPattern.test(input.modelId) &&
    (input.reasoningEffort === "" ||
      isReasoningEffort(input.reasoningEffort)) &&
    permissionModes.includes(input.permissionMode) &&
    validIdList(input.projectIds, 200) &&
    (input.toolsMode === "unrestricted" || input.toolsMode === "restricted") &&
    Array.isArray(input.allowedTools) &&
    input.allowedTools.length <= 50 &&
    input.allowedTools.every(
      (entry) => typeof entry === "string" && toolPattern.test(entry),
    ) &&
    (input.skillsMode === "unrestricted" ||
      input.skillsMode === "restricted") &&
    validIdList(input.skillIds, 200) &&
    (input.mcpMode === "unrestricted" || input.mcpMode === "restricted") &&
    validIdList(input.mcpServerIds, 50)
  );
}

export function normalizeAgentInput(input: CreateAgentInput): CreateAgentInput {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    instructions: input.instructions,
    providerId: input.providerId,
    modelId: input.modelId,
    reasoningEffort: input.reasoningEffort,
    permissionMode: input.permissionMode,
    projectIds: [...input.projectIds],
    toolsMode: input.toolsMode,
    allowedTools:
      input.toolsMode === "restricted" ? [...input.allowedTools] : [],
    skillsMode: input.skillsMode,
    skillIds: input.skillsMode === "restricted" ? [...input.skillIds] : [],
    mcpMode: input.mcpMode,
    mcpServerIds: input.mcpMode === "restricted" ? [...input.mcpServerIds] : [],
  };
}

export function agentInputError(input: CreateAgentInput): string {
  return agentCapabilityIssues(input)[0] || "";
}
