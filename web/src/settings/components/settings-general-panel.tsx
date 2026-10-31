import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";

export function SettingsGeneralPanel() {
  return (
    <Center id="settings-panel-general" className="min-h-0 flex-1">
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
  );
}
