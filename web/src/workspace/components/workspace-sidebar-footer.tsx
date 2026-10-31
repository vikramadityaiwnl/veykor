import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBrain, faGear, faRobot } from "@fortawesome/free-solid-svg-icons";
import { Divider } from "@astryxdesign/core/Divider";
import { SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/VStack";

export function WorkspaceSidebarFooter() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <VStack gap={2}>
      <Divider />
      <SideNavSection title="Workspace" isHeaderHidden>
        <SideNavItem
          label="Agent presets"
          icon={<FontAwesomeIcon icon={faRobot} size="sm" aria-hidden="true" />}
          isSelected={location.pathname === "/agent-presets"}
          onClick={() => {
            navigate("/agent-presets");
          }}
        />
        <SideNavItem
          label="Memory"
          icon={<FontAwesomeIcon icon={faBrain} size="sm" aria-hidden="true" />}
          isSelected={location.pathname === "/memory"}
          onClick={() => {
            navigate("/memory");
          }}
        />
        <SideNavItem
          label="Settings"
          icon={<FontAwesomeIcon icon={faGear} size="sm" aria-hidden="true" />}
          isSelected={location.pathname === "/settings"}
          onClick={() => {
            navigate("/settings");
          }}
        />
      </SideNavSection>
    </VStack>
  );
}
