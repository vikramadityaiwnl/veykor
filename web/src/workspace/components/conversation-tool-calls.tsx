import type { ChatToolCall } from "@veykor/shared";
import { Collapsible, CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { ConversationToolDetail } from "./conversation-tool-detail";
import { toolCallPresentation } from "../tool-call-presentation";

interface Props {
  tools: ChatToolCall[];
}

const statuses = {
  pending: "Pending",
  running: "Running",
  complete: "Completed",
  error: "Failed",
};

export function ConversationToolCalls(props: Props) {
  return (
    <CollapsibleGroup type="multiple" hasDividers density="compact">
      {props.tools.map((tool) => (
        <Collapsible
          key={tool.id}
          value={tool.id}
          trigger={
            <HStack gap={3} className="min-w-0 flex-1">
              <Text type="supporting" weight="semibold">
                {tool.name}
              </Text>
              <Text
                type="supporting"
                maxLines={1}
                hasTruncateTooltip={false}
                className="min-w-0 flex-1"
              >
                {toolCallPresentation(tool.target, "").primary.split("\n")[0]}
              </Text>
              <Text
                type="supporting"
                className={
                  tool.status === "running"
                    ? "chat-thinking shrink-0"
                    : "shrink-0"
                }
              >
                {statuses[tool.status]}
              </Text>
            </HStack>
          }
        >
          <ConversationToolDetail tool={tool} />
        </Collapsible>
      ))}
    </CollapsibleGroup>
  );
}
