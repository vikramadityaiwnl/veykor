import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import { Center } from "@astryxdesign/core/Center";
import { VStack } from "@astryxdesign/core/VStack";
import { EmptyState } from "@astryxdesign/core/EmptyState";

export function SettingsGeneralPanel() {
  return (
    <VStack
      id="settings-panel-general"
      isScrollable
      className="min-h-0 flex-1 overscroll-contain"
    >
      <Center className="min-h-full shrink-0">
        <EmptyState
          title="General settings are coming soon"
          description="Workspace-wide preferences will live here."
          icon={
            <FontAwesomeIcon
              icon={faGear}
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
