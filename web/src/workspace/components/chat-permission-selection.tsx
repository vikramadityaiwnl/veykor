import type { ReactNode } from "react";
import type { ChatPermissionMode } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faCircleQuestion, faShieldHalved, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Text } from "@astryxdesign/core/Text";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";

interface Props {
  providerId: string;
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
    description: "Ask before running actions outside the provider’s rules.",
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
    description: "Allow actions without asking. Use with care.",
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
  const availableOptions =
    props.providerId === "opencode"
      ? [
          ...options.filter((option) => option.value !== "onRequest"),
          legacyOption,
        ]
      : props.value === "denyUnmatched"
        ? [...options, legacyOption]
        : options;

  return (
    <Selector
      label="Permission mode"
      isLabelHidden
      size="sm"
      variant="ghost"
      placement="above"
      value={props.value}
      options={availableOptions}
      renderOption={(option) =>
        option.value === "allowAll" ? (
          <SelectorOption
            icon={option.icon}
            label={
              <Text type="inherit" className="text-(--color-text-red)">
                {option.label}
              </Text>
            }
            description={
              <Text type="inherit" className="text-(--color-text-red)">
                {option.description}
              </Text>
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
                  <Text type="inherit" className="text-(--color-text-red)">
                    {option.label}
                  </Text>
                }
              />
            )
          : undefined
      }
      onChange={(mode) => props.onChange(mode as ChatPermissionMode)}
    />
  );
}
