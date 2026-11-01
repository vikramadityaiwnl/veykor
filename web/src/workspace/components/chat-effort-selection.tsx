import type { ChatModel, ChatReasoningEffort } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faBatteryFull, faBatteryHalf, faBatteryQuarter, faBatteryThreeQuarters, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";

interface Props {
  model: ChatModel | undefined;
  value: ChatReasoningEffort;
  onChange: (effort: ChatReasoningEffort) => void;
}

const tierLabels: Record<ChatReasoningEffort, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "X-High",
  max: "Max",
  ultra: "Ultra",
};

const tierDescriptions: Record<ChatReasoningEffort, string> = {
  none: "No thinking step. Answers directly.",
  minimal: "A quick pass before answering.",
  low: "Light thinking for simple tasks.",
  medium: "Balanced thinking for everyday work.",
  high: "Deeper thinking for hard problems.",
  xhigh: "Extended thinking for complex work.",
  max: "Maximum thinking for the toughest tasks.",
  ultra: "Beyond max. Slowest and most thorough.",
};

const tierIcons: Record<ChatReasoningEffort, IconDefinition> = {
  none: faBan,
  minimal: faBatteryQuarter,
  low: faBatteryQuarter,
  medium: faBatteryHalf,
  high: faBatteryThreeQuarters,
  xhigh: faBatteryThreeQuarters,
  max: faBatteryFull,
  ultra: faBatteryFull,
};

export function ChatEffortSelection(props: Props) {
  const options = (props.model?.reasoningEfforts || []).map((option) => ({
    value: option.tier,
    label: tierLabels[option.tier],
    description: option.description || tierDescriptions[option.tier],
    icon: <FontAwesomeIcon icon={tierIcons[option.tier]} />,
  }));

  return (
    <Selector
      label="Reasoning effort"
      isLabelHidden
      size="sm"
      variant="ghost"
      placement="above"
      controlClassName="veykor-collapsed-trigger"
      renderValue={(option) => (
        <SelectorOption
          icon={option.icon}
          label={<span className="veykor-collapsed-label">{option.label}</span>}
        />
      )}
      value={props.value}
      options={options}
      emptyText="No effort levels available"
      isDisabled={options.length === 0}
      onChange={(tier) => props.onChange(tier as ChatReasoningEffort)}
    />
  );
}
