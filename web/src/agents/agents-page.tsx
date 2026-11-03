import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";
import type { Agent } from "@veykor/shared";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { WorkspacePageHeader } from "../workspace/components/workspace-page-header";
import { useSettingsStore } from "../settings/settings-store";
import { useProjectsStore } from "../workspace/projects-store";
import { useSkillsStore } from "../integrations/skills-store";
import { useMcpServersStore } from "../integrations/mcp-servers-store";
import { useAgentsStore } from "./agents-store";
import { AgentFormDialog } from "./components/agent-form-dialog";

export function AgentsPage() {
  const agents = useAgentsStore((state) => state.agents);
  const status = useAgentsStore((state) => state.status);
  const error = useAgentsStore((state) => state.error);
  const load = useAgentsStore((state) => state.load);
  const remove = useAgentsStore((state) => state.remove);
  const loadProviders = useSettingsStore((state) => state.load);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const loadSkills = useSkillsStore((state) => state.load);
  const loadMcp = useMcpServersStore((state) => state.load);
  const [dialogAgent, setDialogAgent] = useState<Agent | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    void load();
    void loadProviders();
    void loadProjects();
    void loadSkills();
    void loadMcp();
  }, [load, loadProviders, loadProjects, loadSkills, loadMcp]);

  function summary(agent: Agent): string {
    const projects =
      agent.projectIds.length === 0
        ? "No projects"
        : `${agent.projectIds.length} project${agent.projectIds.length === 1 ? "" : "s"}`;
    const effort = agent.reasoningEffort || "model default";

    return `${agent.providerId} · ${agent.modelId} · ${effort} · ${projects}`;
  }

  return (
    <VStack gap={4} padding={6} className="min-h-0 flex-1 overflow-hidden">
      <HStack gap={3} vAlign="center" className="shrink-0">
        <VStack gap={1} className="min-w-0 flex-1">
          <WorkspacePageHeader
            title="Agents"
            description="Manage the provider, model, instructions, and tools your agents use."
          />
        </VStack>

        <Button
          label="Create agent"
          variant="primary"
          clickAction={() => {
            setDialogAgent(null);
            setIsDialogOpen(true);
          }}
        />
      </HStack>

      <Divider />

      {error || actionError ? (
        <Banner status="error" title={error || actionError} />
      ) : null}

      <VStack isScrollable className="min-h-0 flex-1 overscroll-contain">
        {status === "loading" && agents.length === 0 ? (
          <Center className="min-h-full shrink-0">
            <Spinner label="Loading agents" />
          </Center>
        ) : agents.length === 0 ? (
          <Center className="min-h-full shrink-0">
            <EmptyState
              title="No agents yet"
              description="Create an agent, assign it to a project, then select it from a project chat."
              icon={
                <FontAwesomeIcon
                  icon={faRobot}
                  size="sm"
                  className="size-(--spacing-10)! text-(--color-icon-secondary)"
                  aria-hidden="true"
                />
              }
            />
          </Center>
        ) : (
          <List>
            {agents.map((agent) => (
              <ListItem
                key={agent.id}
                label={agent.name}
                description={
                  <VStack gap={1}>
                    {agent.description ? (
                      <Text type="inherit">{agent.description}</Text>
                    ) : null}
                    <Text type="inherit" color="secondary">
                      {summary(agent)}
                    </Text>
                  </VStack>
                }
                startContent={
                  <FontAwesomeIcon
                    icon={faRobot}
                    className="text-(--color-icon-secondary)"
                    aria-hidden="true"
                  />
                }
                endContent={
                  <HStack gap={2}>
                    <Button
                      label="Edit"
                      size="sm"
                      variant="secondary"
                      clickAction={() => {
                        setDialogAgent(agent);
                        setIsDialogOpen(true);
                      }}
                    />

                    <Button
                      label="Delete"
                      size="sm"
                      variant="secondary"
                      clickAction={() => setPendingDelete(agent)}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        )}
      </VStack>

      {isDialogOpen ? (
        <AgentFormDialog
          key={dialogAgent?.id || "create"}
          agent={dialogAgent}
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
        />
      ) : null}

      <AlertDialog
        isOpen={!!pendingDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingDelete(null);
          }
        }}
        title="Delete this agent?"
        description="Existing conversations keep their saved agent settings and name. New chats can no longer select this agent."
        actionLabel="Delete agent"
        onAction={async () => {
          if (!pendingDelete) {
            return false;
          }

          try {
            await remove(pendingDelete.id);
            setPendingDelete(null);
            setActionError("");
            return true;
          } catch {
            setActionError("Unable to delete this agent. Please try again.");
            return false;
          }
        }}
      />
    </VStack>
  );
}
