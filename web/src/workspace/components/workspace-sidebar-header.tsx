import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCompress } from "@fortawesome/free-solid-svg-icons";
import { SideNavCollapseButton, SideNavHeading } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  isCollapsed: boolean;
}

export function WorkspaceSidebarHeader(props: Props) {
  return (
    <VStack className="relative w-full">
      <SideNavHeading
        icon={
          <img
            className="size-(--spacing-9) object-contain dark:invert"
            src="/logo.svg"
            alt=""
          />
        }
        heading="veykor"
        className="w-full py-2"
      />
      {props.isCollapsed ? null : (
        <SideNavCollapseButton className="absolute top-1/2 right-2 -translate-y-1/2">
          <FontAwesomeIcon icon={faCompress} aria-hidden="true" />
        </SideNavCollapseButton>
      )}
    </VStack>
  );
}
