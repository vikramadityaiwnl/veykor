import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";
import type { ProjectAgent } from "@veykor/shared";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";

interface Props {
  agents: ProjectAgent[];
  value: string;
  isLocked: boolean;
  lockedName: string;
  onChange: (agentId: string) => void;
}

export function AgentSelector(props: Props) {
  if (props.isLocked) {
    return (
      <Text
        type="supporting"
        color="secondary"
        className="flex items-center gap-2 px-2"
      >
        <FontAwesomeIcon icon={faRobot} aria-hidden="true" />
        {props.lockedName || "Agent"}
      </Text>
    );
  }

  return (
    <Selector
      startIcon={<FontAwesomeIcon icon={faRobot} />}
      label="Agent"
      isLabelHidden
      variant="ghost"
      size="sm"
      placement="above"
      controlClassName="veykor-collapsed-trigger"
      value={props.value}
      emptyText="No agents available for this project"
      placeholder="Choose agent"
      disabledMessage={
        props.agents.length === 0
          ? "No agents available for this project. Create one from Agents and assign it to this project."
          : undefined
      }
      isDisabled={props.agents.length === 0}
      options={props.agents.map((agent) => ({
        value: agent.id,
        label: agent.name,
        description: `${agent.providerId} · ${agent.modelId}${agent.reasoningEffort ? ` · ${agent.reasoningEffort}` : ""}`,
        icon: <FontAwesomeIcon icon={faRobot} />,
      }))}
      onChange={props.onChange}
    />
  );
}
