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
        title="Agent presets"
        description="Saved starting points for veykor agents: the provider, model, instructions, and tools each session begins with. Presets keep repeated workflows one click away instead of retyped every time."
      />

      <Divider />

      <VStack isScrollable className="min-h-0 flex-1 overscroll-contain">
        <Center className="min-h-full shrink-0">
          <EmptyState
            title="No agent presets yet"
            description="Presets you create will appear here, ready to start a session."
            icon={
              <FontAwesomeIcon
                icon={faRobot}
                size="sm"
                className="text-(--color-icon-secondary)"
                aria-hidden="true"
              />
            }
          />
        </Center>
      </VStack>
    </VStack>
  );
}
