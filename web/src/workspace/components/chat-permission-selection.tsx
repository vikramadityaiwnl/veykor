import type { ReactNode } from "react";
import type { ChatPermissionMode } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faCircleQuestion, faShieldHalved, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";

interface Props {
  value: ChatPermissionMode;
  onChange: (mode: ChatPermissionMode) => void;
}

interface PermissionOption {
  value: ChatPermissionMode;
  label: string;
  description: string;
  icon: ReactNode;
}

const options: PermissionOption[] = [
  {
    value: "promptUnmatched",
    label: "Ask for approval",
    description: "Muse asks before running actions outside your rules.",
    icon: <FontAwesomeIcon icon={faCircleQuestion} />,
  },
  {
    value: "onRequest",
    label: "Approve for me",
    description:
      "Muse handles routine approvals and asks only when it needs you.",
    icon: <FontAwesomeIcon icon={faShieldHalved} />,
  },
  {
    value: "allowAll",
    label: "Full access",
    description: "Muse runs everything without asking. Use with care.",
    icon: (
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        className="text-(--color-text-red)"
      />
    ),
  },
];

const legacyOption: PermissionOption = {
  value: "denyUnmatched",
  label: "Deny unmatched actions",
  description: "Actions outside your rules are blocked without asking.",
  icon: <FontAwesomeIcon icon={faBan} />,
};

export function ChatPermissionSelection(props: Props) {
  return (
    <Selector
      label="Permission mode"
      isLabelHidden
      size="sm"
      variant="ghost"
      placement="above"
      value={props.value}
      options={
        props.value === "denyUnmatched" ? [...options, legacyOption] : options
      }
      renderOption={(option) =>
        option.value === "allowAll" ? (
          <SelectorOption
            icon={option.icon}
            label={
              <span className="text-(--color-text-red)">{option.label}</span>
            }
            description={
              <span className="text-(--color-text-red)">
                {option.description}
              </span>
            }
          />
        ) : (
          <SelectorOption
            icon={option.icon}
            label={option.label}
            description={option.description}
          />
        )
      }
      renderValue={
        props.value === "allowAll"
          ? (option) => (
              <SelectorOption
                icon={option.icon}
                label={
                  <span className="text-(--color-text-red)">
                    {option.label}
                  </span>
                }
              />
            )
          : undefined
      }
      onChange={(mode) => props.onChange(mode as ChatPermissionMode)}
    />
  );
}
