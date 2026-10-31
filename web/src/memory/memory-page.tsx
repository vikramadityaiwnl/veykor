import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBrain } from "@fortawesome/free-solid-svg-icons";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";
import { WorkspacePageHeader } from "../workspace/components/workspace-page-header";

export function MemoryPage() {
  return (
    <VStack gap={4} padding={6} className="min-h-0 flex-1">
      <WorkspacePageHeader
        title="Memory"
        description="Everything veykor remembers across sessions: decisions, preferences, project facts, and corrections. Memory turns one-off chats into a workspace that knows how you work."
      />

      <Divider />

      <Center className="min-h-0 flex-1">
        <EmptyState
          title="No memories yet"
          description="Things veykor learns from your sessions will be stored here."
          icon={
            <FontAwesomeIcon
              icon={faBrain}
              size="sm"
              className="text-(--color-icon-secondary)"
              aria-hidden="true"
            />
          }
        />
      </Center>
    </VStack>
  );
}
