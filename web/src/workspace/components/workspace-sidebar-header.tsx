import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCompress } from "@fortawesome/free-solid-svg-icons";
import { SideNavCollapseButton, SideNavHeading } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  isCollapsed: boolean;
  onHome: () => void;
}

export function WorkspaceSidebarHeader(props: Props) {
  return (
    <VStack className="relative w-full">
      <Link
        to="/"
        onClick={props.onHome}
        aria-label="veykor home"
        className="cursor-pointer text-inherit no-underline [&_*]:cursor-pointer"
      >
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
      </Link>
      {props.isCollapsed ? null : (
        <SideNavCollapseButton className="absolute top-1/2 right-2 -translate-y-1/2">
          <FontAwesomeIcon icon={faCompress} aria-hidden="true" />
        </SideNavCollapseButton>
      )}
    </VStack>
  );
}
