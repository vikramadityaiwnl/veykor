import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";
import type { Agent, AgentAccessMode, ChatPermissionMode, ChatReasoningEffort, CreateAgentInput, ProviderCliId } from "@veykor/shared";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useSettingsStore } from "../../settings/settings-store";
import { useProjectsStore } from "../../workspace/projects-store";
import { useSkillsStore } from "../../integrations/skills-store";
import { useMcpServersStore } from "../../integrations/mcp-servers-store";
import { useAgentsStore } from "../agents-store";

interface Props {
  agent: Agent | null;
  isOpen: boolean;
  onClose: () => void;
}

const effortLabels: Record<ChatReasoningEffort, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "X-High",
  max: "Max",
  ultra: "Ultra",
};

export function AgentFormDialog(props: Props) {
  const editing = props.agent;
  const providers = useSettingsStore((state) => state.providers);
  const projects = useProjectsStore((state) => state.projects);
  const skillSources = useSkillsStore((state) => state.sources);
  const mcpServers = useMcpServersStore((state) => state.servers);
  const create = useAgentsStore((state) => state.create);
  const update = useAgentsStore((state) => state.update);

  const [name, setName] = useState(editing?.name || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [instructions, setInstructions] = useState(editing?.instructions || "");
  const [providerId, setProviderId] = useState<string>(
    editing?.providerId || "",
  );
  const [modelId, setModelId] = useState(editing?.modelId || "");
  const [reasoningEffort, setReasoningEffort] = useState<string>(
    editing?.reasoningEffort || "",
  );
  const [permissionMode, setPermissionMode] = useState<string>(
    editing?.permissionMode || "promptUnmatched",
  );
  const [projectIds, setProjectIds] = useState<string[]>(
    editing?.projectIds || [],
  );
  const [toolsMode, setToolsMode] = useState<AgentAccessMode>(
    editing?.toolsMode || "unrestricted",
  );
  const [toolsText, setToolsText] = useState(
    (editing?.allowedTools || []).join("\n"),
  );
  const [skillsMode, setSkillsMode] = useState<AgentAccessMode>(
    editing?.skillsMode || "unrestricted",
  );
  const [skillIds, setSkillIds] = useState<string[]>(editing?.skillIds || []);
  const [mcpMode, setMcpMode] = useState<AgentAccessMode>(
    editing?.mcpMode || "unrestricted",
  );
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(
    editing?.mcpServerIds || [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const availableProviders = providers.filter((entry) => entry.available);
  const effectiveProviderId =
    availableProviders.find((entry) => entry.id === providerId)?.id ||
    availableProviders[0]?.id ||
    "";
  const provider = providers.find((entry) => entry.id === effectiveProviderId);
  const effectiveModelId =
    provider?.models.find((entry) => entry.id === modelId)?.id ||
    provider?.models[0]?.id ||
    "";
  const model = provider?.models.find((entry) => entry.id === effectiveModelId);
  const skills = skillSources.flatMap((source) => source.skills);
  const mcpUnsupported =
    effectiveProviderId === "opencode" && mcpMode === "restricted";
  const capabilityError = mcpUnsupported
    ? "OpenCode cannot limit MCP servers per conversation yet. Use unrestricted MCP access or choose Muse Code."
    : "";

  function draft(): CreateAgentInput {
    return {
      name: name.trim(),
      description: description.trim(),
      instructions,
      providerId: effectiveProviderId as ProviderCliId,
      modelId: effectiveModelId,
      reasoningEffort: reasoningEffort as ChatReasoningEffort | "",
      permissionMode: permissionMode as ChatPermissionMode,
      projectIds,
      toolsMode,
      allowedTools:
        toolsMode === "restricted"
          ? toolsText
              .split("\n")
              .map((entry) => entry.trim())
              .filter(Boolean)
          : [],
      skillsMode,
      skillIds: skillsMode === "restricted" ? skillIds : [],
      mcpMode,
      mcpServerIds: mcpMode === "restricted" ? mcpServerIds : [],
    };
  }

  function valid(): boolean {
    return (
      name.trim().length > 0 &&
      !!effectiveProviderId &&
      !!effectiveModelId &&
      !capabilityError
    );
  }

  async function save() {
    if (!valid() || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      if (editing) {
        await update(editing.id, draft());
      } else {
        await create(draft());
      }

      props.onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save this agent.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      isOpen={props.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          props.onClose();
        }
      }}
      purpose="form"
      width={640}
    >
      <Layout
        header={
          <DialogHeader
            title={editing ? "Edit agent" : "Create agent"}
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                props.onClose();
              }
            }}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {error || capabilityError ? (
                <Banner status="error" title={error || capabilityError} />
              ) : null}

              <TextInput
                label="Name"
                value={name}
                onChange={setName}
                placeholder="e.g. Code reviewer"
                hasAutoFocus
              />

              <TextInput
                label="Description"
                value={description}
                onChange={setDescription}
                placeholder="What this agent is for"
              />

              <TextArea
                label="Instructions"
                value={instructions}
                onChange={setInstructions}
                placeholder="How this agent should work"
                rows={5}
              />

              <Selector
                label="Provider"
                value={effectiveProviderId}
                onChange={(value) => {
                  setProviderId(value);
                  setModelId("");
                  setReasoningEffort("");
                }}
                width="100%"
                emptyText="No providers available"
                options={availableProviders.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                  icon: <FontAwesomeIcon icon={faRobot} />,
                }))}
              />

              <Selector
                label="Model"
                value={effectiveModelId}
                onChange={(value) => {
                  setModelId(value);
                  setReasoningEffort("");
                }}
                width="100%"
                hasSearch
                emptyText="No models available"
                options={(provider?.models || []).map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                }))}
              />

              {model && model.reasoningEfforts.length > 0 ? (
                <Selector
                  label="Reasoning effort"
                  value={reasoningEffort}
                  onChange={setReasoningEffort}
                  width="100%"
                  options={[
                    { value: "", label: "Model default" },
                    ...model.reasoningEfforts.map((option) => ({
                      value: option.tier,
                      label: effortLabels[option.tier],
                    })),
                  ]}
                />
              ) : null}

              <Selector
                label="Permission default"
                value={permissionMode}
                onChange={setPermissionMode}
                width="100%"
                options={[
                  {
                    value: "promptUnmatched",
                    label: "Ask for approval",
                    description:
                      "Ask before running actions outside the provider rules.",
                  },
                  ...(effectiveProviderId === "opencode"
                    ? []
                    : [
                        {
                          value: "onRequest",
                          label: "Approve for me",
                          description:
                            "Muse handles routine approvals and asks only when needed.",
                        },
                      ]),
                  {
                    value: "denyUnmatched",
                    label: "Deny unmatched actions",
                    description:
                      "Actions outside the rules are blocked without asking.",
                  },
                  {
                    value: "allowAll",
                    label: "Full access",
                    description: "Allow actions without asking. Use with care.",
                  },
                ]}
              />

              <MultiSelector
                label="Projects"
                value={projectIds}
                onChange={setProjectIds}
                emptyText="No projects yet"
                options={projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                }))}
              />

              <Text color="secondary" type="supporting">
                Only agents assigned to a project can be selected in that
                project. An agent with no projects is not available in any
                project chat.
              </Text>

              <Selector
                label="Tools"
                value={toolsMode}
                onChange={(value) => setToolsMode(value as AgentAccessMode)}
                width="100%"
                options={[
                  {
                    value: "unrestricted",
                    label: "Unrestricted",
                    description:
                      "The agent can use every tool the provider offers.",
                  },
                  {
                    value: "restricted",
                    label: "Restricted",
                    description:
                      "Only the tools listed below can run. Others are denied in the backend.",
                  },
                ]}
              />

              {toolsMode === "restricted" ? (
                <TextArea
                  label="Allowed tools"
                  value={toolsText}
                  onChange={setToolsText}
                  placeholder={"One tool name per line"}
                  rows={4}
                />
              ) : null}

              <Selector
                label="Skills"
                value={skillsMode}
                onChange={(value) => setSkillsMode(value as AgentAccessMode)}
                width="100%"
                options={[
                  {
                    value: "unrestricted",
                    label: "Unrestricted",
                    description: "Every detected skill stays available.",
                  },
                  {
                    value: "restricted",
                    label: "Restricted",
                    description:
                      "Only the selected skills are loaded for this agent.",
                  },
                ]}
              />

              {skillsMode === "restricted" ? (
                <MultiSelector
                  label="Allowed skills"
                  value={skillIds}
                  onChange={setSkillIds}
                  hasSearch={skills.length > 15}
                  emptyText="No skills detected"
                  options={skills.map((skill) => ({
                    value: skill.id,
                    label: skill.name,
                    description: skill.description || undefined,
                  }))}
                />
              ) : null}

              <Selector
                label="MCP integrations"
                value={mcpMode}
                onChange={(value) => setMcpMode(value as AgentAccessMode)}
                width="100%"
                options={[
                  {
                    value: "unrestricted",
                    label: "Unrestricted",
                    description:
                      "Every enabled MCP server is available, as today.",
                  },
                  {
                    value: "restricted",
                    label: "Restricted",
                    description:
                      "Only the selected MCP servers are loaded for this agent.",
                  },
                ]}
              />

              {mcpMode === "restricted" ? (
                <VStack gap={2}>
                  <MultiSelector
                    label="Allowed MCP servers"
                    value={mcpServerIds}
                    onChange={setMcpServerIds}
                    emptyText="No MCP servers yet"
                    options={mcpServers.map((server) => ({
                      value: server.id,
                      label: server.name,
                      description: server.enabled ? undefined : "Disabled",
                    }))}
                  />

                  <Text color="secondary" type="supporting">
                    Restricted MCP uses your saved MCP servers only. Detected
                    servers stay available when access is unrestricted.
                  </Text>
                </VStack>
              ) : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button
                label="Cancel"
                variant="secondary"
                clickAction={props.onClose}
              />

              <Button
                label={editing ? "Save agent" : "Create agent"}
                variant="primary"
                isDisabled={!valid() || isSaving}
                clickAction={() => void save()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
