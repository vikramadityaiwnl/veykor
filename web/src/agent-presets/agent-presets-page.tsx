import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";
import { WorkspacePageHeader } from "../workspace/components/workspace-page-header";

export function AgentPresetsPage() {
  return (
    <VStack gap={4} padding={6} className="min-h-0 flex-1 overflow-hidden">
      <WorkspacePageHeader
        title="Agents"
        description="Manage the provider, model, instructions, and tools your agents use."
      />

      <Divider />

      <VStack isScrollable className="min-h-0 flex-1 overscroll-contain">
        <Center className="min-h-full shrink-0">
          <EmptyState
            title="No agents yet"
            description="Agents you create will appear here, ready to start a session."
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
      </VStack>
    </VStack>
  );
}
