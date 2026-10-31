import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBrain, faGear, faRobot } from "@fortawesome/free-solid-svg-icons";
import { Divider } from "@astryxdesign/core/Divider";
import { SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/VStack";

export function WorkspaceSidebarFooter() {
  return (
    <VStack gap={2}>
      <Divider />
      <SideNavSection title="Workspace" isHeaderHidden>
        <SideNavItem
          label="Agent presets"
          icon={<FontAwesomeIcon icon={faRobot} size="sm" aria-hidden="true" />}
        />
        <SideNavItem
          label="Memory"
          icon={<FontAwesomeIcon icon={faBrain} size="sm" aria-hidden="true" />}
        />
        <SideNavItem
          label="Settings"
          icon={<FontAwesomeIcon icon={faGear} size="sm" aria-hidden="true" />}
        />
      </SideNavSection>
    </VStack>
  );
}
