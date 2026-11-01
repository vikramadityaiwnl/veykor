import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHexagonNodes, faGear, faRobot, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { useSideNavCollapse } from "@astryxdesign/core/SideNav";
import { Avatar } from "@astryxdesign/core/Avatar";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Banner } from "@astryxdesign/core/Banner";
import { useState } from "react";
import { useAuthStore } from "../../auth/auth-store";
import { VStack } from "@astryxdesign/core/VStack";

export function WorkspaceSidebarFooter() {
  const mobile = useAppShellMobile();
  const collapse = useSideNavCollapse();
  const user = useAuthStore((state) => state.status?.user);
  const logout = useAuthStore((state) => state.logout);
  const [error, setError] = useState("");
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <VStack gap={2} className="shrink-0">
      {error && <Banner status="error" title={error} />}
      <DropdownMenu
        placement="above"
        renderTrigger={(trigger) => (
          <button
            {...trigger}
            type="button"
            className={`flex w-full items-center rounded-(--radius-element) p-2 text-left transition-colors hover:bg-(--color-neutral) active:bg-(--color-neutral) aria-expanded:bg-(--color-neutral) focus-visible:outline-auto ${collapse.isCollapsed ? "justify-center" : "gap-3"}`}
          >
            <Avatar
              name={user?.username || "Account"}
              src={user?.photo || undefined}
              size="md"
              tooltip={false}
            />
            {collapse.isCollapsed ? null : (
              <HStack className="min-w-0 flex-1">
                <Text maxLines={1}>{user?.username || "Account"}</Text>
              </HStack>
            )}
          </button>
        )}
        items={[
          {
            label: "Agents",
            icon: <FontAwesomeIcon icon={faRobot} />,
            onClick: () => {
              mobile.closeMobileNav();
              navigate("/agent-presets");
            },
          },
          {
            label: "Integrations",
            icon: <FontAwesomeIcon icon={faHexagonNodes} />,
            onClick: () => {
              mobile.closeMobileNav();
              navigate("/integrations");
            },
          },
          {
            label: "Settings",
            icon: <FontAwesomeIcon icon={faGear} />,
            onClick: () => {
              mobile.closeMobileNav();
              navigate("/settings");
            },
          },
          {
            label: "Sign out",
            variant: "destructive",
            icon: <FontAwesomeIcon icon={faRightFromBracket} />,
            onClick: () => setIsSignOutOpen(true),
          },
        ]}
      />
      <AlertDialog
        isOpen={isSignOutOpen}
        onOpenChange={setIsSignOutOpen}
        title="Sign out?"
        description="You will need to sign in again to access your veykor workspace."
        actionLabel="Sign out"
        onAction={async () => {
          try {
            await logout();
            setIsSignOutOpen(false);
            return true;
          } catch {
            setError("Unable to sign out. Please try again.");
            return false;
          }
        }}
      />
    </VStack>
  );
}
