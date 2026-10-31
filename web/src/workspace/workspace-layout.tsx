import { useRef, useState, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBrain, faCompress, faEllipsis, faExpand, faGear, faInbox, faMagnifyingGlass, faPlus, faRobot } from "@fortawesome/free-solid-svg-icons";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { CommandPalette } from "@astryxdesign/core/CommandPalette";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Kbd } from "@astryxdesign/core/Kbd";
import { SideNav, SideNavCollapseButton, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TopNav } from "@astryxdesign/core/TopNav";
import { useHotkeys } from "@astryxdesign/core/hooks";
import { createStaticSource } from "@astryxdesign/core/Typeahead";
import { VStack } from "@astryxdesign/core/VStack";
import { workspaceProjects, type WorkspaceProject } from "./workspace-data";

const commandPaletteSource = createStaticSource([]);

interface WorkspaceSectionProps {
  label: string;
  listId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  children: ReactNode;
}

function WorkspaceSectionEmpty() {
  return (
    <EmptyState
      className="h-24 py-0 [&_h3]:!text-(--color-text-secondary)"
      icon={
        <FontAwesomeIcon
          icon={faInbox}
          size="sm"
          className="text-(--color-icon-secondary)"
          aria-hidden="true"
        />
      }
      title="Nothing here"
      isCompact
    />
  );
}

function WorkspaceSection(props: WorkspaceSectionProps) {
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center">
        <Button
          label={props.label}
          variant="ghost"
          size="sm"
          className="flex-1 !justify-start !bg-transparent hover:!bg-none active:!bg-none"
          aria-expanded={props.isExpanded}
          aria-controls={props.isExpanded ? props.listId : undefined}
          onClick={props.onToggle}
        />
        {props.onAdd ? (
          <Button
            label={`Add to ${props.label}`}
            isIconOnly
            variant="secondary"
            size="sm"
            className="!border-0 !bg-transparent !shadow-none text-(--color-icon-secondary) hover:!bg-none hover:text-(--color-text-primary) active:!bg-none"
            icon={
              <FontAwesomeIcon icon={faPlus} size="sm" aria-hidden="true" />
            }
            clickAction={props.onAdd}
          />
        ) : null}
      </HStack>
      {props.isExpanded ? (
        <VStack
          id={props.listId}
          role="group"
          aria-label={props.label}
          gap={1}
          className="ps-4"
        >
          {props.children}
        </VStack>
      ) : null}
    </VStack>
  );
}

export interface WorkspaceOutletContext {
  project: WorkspaceProject | null;
}

export function WorkspaceLayout() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [additionalProjects, setAdditionalProjects] = useState<
    WorkspaceProject[]
  >([]);
  const [query, setQuery] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [areProjectsExpanded, setAreProjectsExpanded] = useState(true);
  const [areChatsExpanded, setAreChatsExpanded] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useHotkeys([
    {
      keys: "mod+k",
      allowInInputs: true,
      isDisabled: isCommandPaletteOpen,
      onPress: () => {
        if (isSidebarCollapsed) {
          setIsCommandPaletteOpen(true);
          return;
        }

        searchInputRef.current?.focus();
      },
    },
  ]);

  const project =
    [...workspaceProjects, ...additionalProjects].find(
      (item) => item.id === selectedProjectId,
    ) ?? null;

  const projects = [...workspaceProjects, ...additionalProjects];

  const needle = query.trim().toLowerCase();

  const visibleProjects = needle
    ? projects.filter((item) => item.name.toLowerCase().includes(needle))
    : projects;

  function addProject() {
    setAdditionalProjects((currentProjects) => [
      ...currentProjects,
      {
        id: `new-project-${currentProjects.length + 1}`,
        name: `New project ${currentProjects.length + 1}`,
      },
    ]);
    setAreProjectsExpanded(true);
  }

  return (
    <AppShell
      contentPadding={0}
      variant="section"
      sideNav={
        <SideNav
          collapsible={{
            isCollapsed: isSidebarCollapsed,
            onCollapsedChange: setIsSidebarCollapsed,
            hasButton: false,
          }}
          header={
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
              {isSidebarCollapsed ? null : (
                <SideNavCollapseButton className="absolute top-1/2 right-2 -translate-y-1/2">
                  <FontAwesomeIcon icon={faCompress} aria-hidden="true" />
                </SideNavCollapseButton>
              )}
            </VStack>
          }
          topContent={
            isSidebarCollapsed ? (
              <VStack gap={1} hAlign="center">
                <Button
                  label="Expand sidebar"
                  isIconOnly
                  variant="ghost"
                  icon={<FontAwesomeIcon icon={faExpand} aria-hidden="true" />}
                  clickAction={() => {
                    setIsSidebarCollapsed(false);
                  }}
                />
                <Button
                  label="Search"
                  isIconOnly
                  variant="ghost"
                  icon={
                    <FontAwesomeIcon
                      icon={faMagnifyingGlass}
                      aria-hidden="true"
                    />
                  }
                  clickAction={() => {
                    setIsCommandPaletteOpen(true);
                  }}
                />
                <Button
                  label="New session"
                  isIconOnly
                  variant="ghost"
                  icon={<FontAwesomeIcon icon={faPlus} aria-hidden="true" />}
                  clickAction={() => {
                    setSelectedProjectId(null);
                  }}
                />
              </VStack>
            ) : (
              <VStack gap={2}>
                <HStack className="group/search relative" vAlign="center">
                  <TextInput
                    ref={searchInputRef}
                    label="Search"
                    isLabelHidden
                    placeholder="Search"
                    value={query}
                    onChange={setQuery}
                    startIcon={
                      <FontAwesomeIcon
                        icon={faMagnifyingGlass}
                        className="text-(--color-icon-secondary) transition-colors group-focus-within/search:text-(--color-icon-primary)"
                        aria-hidden="true"
                      />
                    }
                    width="100%"
                  />
                  <Kbd
                    keys="mod+k"
                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
                  />
                </HStack>

                <Button
                  label="New session"
                  icon={<FontAwesomeIcon icon={faPlus} aria-hidden="true" />}
                  width="100%"
                  clickAction={() => {
                    setSelectedProjectId(null);
                  }}
                />
              </VStack>
            )
          }
          footer={
            <VStack gap={2}>
              <Divider />
              <SideNavSection title="Workspace" isHeaderHidden>
                <SideNavItem
                  label="Agent presets"
                  icon={
                    <FontAwesomeIcon
                      icon={faRobot}
                      size="sm"
                      aria-hidden="true"
                    />
                  }
                />
                <SideNavItem
                  label="Memory"
                  icon={
                    <FontAwesomeIcon
                      icon={faBrain}
                      size="sm"
                      aria-hidden="true"
                    />
                  }
                />
                <SideNavItem
                  label="Settings"
                  icon={
                    <FontAwesomeIcon
                      icon={faGear}
                      size="sm"
                      aria-hidden="true"
                    />
                  }
                />
              </SideNavSection>
            </VStack>
          }
        >
          {isSidebarCollapsed ? null : (
            <VStack gap={4} className="pt-4">
              <WorkspaceSection
                label="Projects"
                listId="workspace-projects-list"
                isExpanded={areProjectsExpanded}
                onToggle={() => {
                  setAreProjectsExpanded((expanded) => !expanded);
                }}
                onAdd={addProject}
              >
                {visibleProjects.length === 0 ? (
                  <WorkspaceSectionEmpty />
                ) : (
                  visibleProjects.map((item) => (
                    <SideNavItem
                      key={item.id}
                      label={item.name}
                      className="[&+button>span]:hidden"
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
                      <SideNavItem
                        label="No sessions yet"
                        isDisabled
                        size="sm"
                      />
                    </SideNavItem>
                  ))
                )}
              </WorkspaceSection>

              <WorkspaceSection
                label="Chats"
                listId="workspace-chats-list"
                isExpanded={areChatsExpanded}
                onToggle={() => {
                  setAreChatsExpanded((expanded) => !expanded);
                }}
              >
                <WorkspaceSectionEmpty />
              </WorkspaceSection>
            </VStack>
          )}
        </SideNav>
      }
    >
      <VStack minHeight="100%" gap={0}>
        {project ? (
          <TopNav
            label="Project"
            startContent={project.name}
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
                  icon={
                    <FontAwesomeIcon icon={faEllipsis} aria-hidden="true" />
                  }
                />
              </HStack>
            }
          />
        ) : null}

        <Outlet context={{ project } satisfies WorkspaceOutletContext} />
      </VStack>
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        searchSource={commandPaletteSource}
      />
    </AppShell>
  );
}
