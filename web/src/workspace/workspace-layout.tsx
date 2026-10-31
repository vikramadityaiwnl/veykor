import { useState } from "react";
import { Outlet } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDatabase, faEllipsis, faFolder, faGear, faPlus, faSliders } from "@fortawesome/free-solid-svg-icons";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Kbd } from "@astryxdesign/core/Kbd";
import { SideNav, SideNavCollapseButton, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TopNav } from "@astryxdesign/core/TopNav";
import { VStack } from "@astryxdesign/core/VStack";
import { workspaceProjects, type WorkspaceProject } from "./workspace-data";

export interface WorkspaceOutletContext {
  project: WorkspaceProject | null;
}

export function WorkspaceLayout() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState("");

  const project =
    workspaceProjects.find((item) => item.id === selectedProjectId) ?? null;

  const needle = query.trim().toLowerCase();

  const visibleProjects = needle
    ? workspaceProjects.filter((item) =>
        item.name.toLowerCase().includes(needle),
      )
    : workspaceProjects;

  return (
    <AppShell
      contentPadding={0}
      variant="section"
      sideNav={
        <SideNav
          collapsible
          header={
            <SideNavHeading
              icon={
                <img
                  className="size-(--spacing-8) object-contain dark:invert"
                  src="/logo.svg"
                  alt=""
                />
              }
              heading="veykor"
              headerEndContent={<SideNavCollapseButton />}
            />
          }
          topContent={
            <VStack gap={3}>
              <HStack className="relative" vAlign="center">
                <TextInput
                  label="Search projects"
                  isLabelHidden
                  placeholder="Search projects..."
                  value={query}
                  onChange={setQuery}
                  startIcon="search"
                  width="100%"
                />
                <Kbd
                  keys="mod+k"
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
                />
              </HStack>

              <Button
                label="New session"
                icon={<FontAwesomeIcon icon={faPlus} />}
                width="100%"
                clickAction={() => {
                  setSelectedProjectId(null);
                }}
              />
            </VStack>
          }
          footer={
            <SideNavSection title="Workspace" isHeaderHidden>
              <SideNavItem
                label="Agent presets"
                icon={
                  <FontAwesomeIcon
                    icon={faSliders}
                    className="size-(--spacing-4)"
                    aria-hidden="true"
                  />
                }
              />
              <SideNavItem
                label="Memory"
                icon={
                  <FontAwesomeIcon
                    icon={faDatabase}
                    className="size-(--spacing-4)"
                    aria-hidden="true"
                  />
                }
              />
              <SideNavItem
                label="Settings"
                icon={
                  <FontAwesomeIcon
                    icon={faGear}
                    className="size-(--spacing-4)"
                    aria-hidden="true"
                  />
                }
              />
            </SideNavSection>
          }
        >
          <SideNavSection
            title="Projects"
            endContent={
              <HStack gap={1} vAlign="center">
                <Button
                  label="Add project"
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  icon={<FontAwesomeIcon icon={faPlus} aria-hidden="true" />}
                />
                <Button
                  label="Browse project folders"
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  icon={<FontAwesomeIcon icon={faFolder} aria-hidden="true" />}
                />
              </HStack>
            }
          >
            {visibleProjects.length === 0 ? (
              <SideNavItem label="No projects yet" isDisabled size="sm" />
            ) : (
              visibleProjects.map((item) => (
                <SideNavItem
                  key={item.id}
                  label={item.name}
                  icon={
                    <FontAwesomeIcon
                      icon={faFolder}
                      className="size-(--spacing-4)"
                      aria-hidden="true"
                    />
                  }
                  isSelected={item.id === selectedProjectId}
                  onClick={() => {
                    setSelectedProjectId(item.id);
                  }}
                  collapsible={
                    item.id === selectedProjectId
                      ? true
                      : { defaultIsCollapsed: true }
                  }
                >
                  <SideNavItem label="No sessions yet" isDisabled size="sm" />
                </SideNavItem>
              ))
            )}
          </SideNavSection>
        </SideNav>
      }
    >
      <VStack minHeight="100%" gap={0}>
        <TopNav
          label="Project"
          startContent={
            <Text weight="semibold">
              {project ? project.name : "New session"}
            </Text>
          }
          endContent={
            <HStack gap={2} vAlign="center">
              <Button
                label="Project settings"
                isIconOnly
                variant="ghost"
                icon={<FontAwesomeIcon icon={faGear} aria-hidden="true" />}
              />
              <Button
                label="More actions"
                isIconOnly
                variant="ghost"
                icon={<FontAwesomeIcon icon={faEllipsis} aria-hidden="true" />}
              />
            </HStack>
          }
        />

        <Outlet context={{ project } satisfies WorkspaceOutletContext} />
      </VStack>
    </AppShell>
  );
}
