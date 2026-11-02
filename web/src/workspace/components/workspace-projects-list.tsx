import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder, faFolderOpen, faFolderTree, faPen, faPenToSquare, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { Project, SidebarSection } from "@veykor/shared";
import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { ContextMenu, type ContextMenuOption } from "@astryxdesign/core/ContextMenu";
import { SideNavItem } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/VStack";
import type { ChatSession } from "../chat-sessions-store";
import { WorkspaceSectionEmpty } from "./workspace-section-empty";
import { ChatSessionItem } from "./chat-session-item";

interface Props {
  projects: Project[];
  projectSections: SidebarSection[];
  sessions: ChatSession[];
  selectedProjectId: string | null;
  activeSessionId: string | null;
  expandedProjectIds: string[];
  onSelectProject: (id: string) => void;
  onRenameSession: (session: ChatSession) => void;
  onDeleteSession: (session: ChatSession) => void;
  onSelectSession: (id: string) => void;
  onAddSession: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onMoveProject: (projectId: string, sectionId: string) => void;
  onDeleteProject: (project: Project) => void;
}

export function WorkspaceProjectsList(props: Props) {
  const mobile = useAppShellMobile();

  if (props.projects.length === 0) {
    return <WorkspaceSectionEmpty />;
  }

  function sessionsFor(projectId: string): ChatSession[] {
    return props.sessions.filter((session) => session.projectId === projectId);
  }

  function menuItems(project: Project): ContextMenuOption[] {
    const targets = props.projectSections.filter(
      (section) => section.id !== project.sectionId,
    );

    return [
      {
        label: "Edit",
        icon: <FontAwesomeIcon icon={faPen} size="sm" aria-hidden="true" />,
        onClick: () => {
          props.onRenameProject(project.id);
        },
      },
      {
        label: "Move to section",
        icon: (
          <FontAwesomeIcon icon={faFolderTree} size="sm" aria-hidden="true" />
        ),
        ...(targets.length === 0
          ? { isDisabled: true }
          : {
              items: targets.map((section) => ({
                id: section.id,
                label: section.title,
                icon: (
                  <FontAwesomeIcon
                    icon={faFolder}
                    size="sm"
                    aria-hidden="true"
                  />
                ),
                onClick: () => {
                  props.onMoveProject(project.id, section.id);
                },
              })),
            }),
      },
      {
        label: "Delete project",
        icon: <FontAwesomeIcon icon={faTrash} size="sm" aria-hidden="true" />,
        variant: "destructive" as const,
        onClick: () => {
          props.onDeleteProject(project);
        },
      },
    ];
  }

  return (
    <>
      {props.projects.map((item) => {
        const sessions = sessionsFor(item.id);
        const isExpanded = props.expandedProjectIds.includes(item.id);
        const folderIcon = isExpanded ? faFolderOpen : faFolder;

        return (
          <VStack key={item.id} gap={0} className="group">
            <ContextMenu
              label={`${item.name} actions`}
              onContextMenu={(event) => {
                event.stopPropagation();
              }}
              onTouchStart={(event) => {
                event.stopPropagation();
              }}
              items={menuItems(item)}
            >
              <SideNavItem
                label={item.name}
                icon={
                  <FontAwesomeIcon
                    icon={folderIcon}
                    size="sm"
                    aria-hidden="true"
                  />
                }
                selectedIcon={
                  <FontAwesomeIcon
                    icon={folderIcon}
                    size="sm"
                    aria-hidden="true"
                  />
                }
                isSelected={
                  item.id === props.selectedProjectId &&
                  props.activeSessionId === null
                }
                onClick={() => {
                  props.onSelectProject(item.id);
                }}
                collapsible={false}
                actions={
                  <Button
                    label={`New session in ${item.name}`}
                    isIconOnly
                    variant="secondary"
                    size="sm"
                    className="-me-2 !border-0 !bg-transparent !shadow-none text-(--color-icon-secondary) opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:!bg-none hover:!bg-none hover:text-(--color-text-primary) [@media(hover:none)]:opacity-100"
                    icon={
                      <FontAwesomeIcon
                        icon={faPenToSquare}
                        size="sm"
                        aria-hidden="true"
                      />
                    }
                    clickAction={() => {
                      props.onAddSession(item.id);
                      mobile.closeMobileNav();
                    }}
                  />
                }
              >
                {isExpanded ? (
                  sessions.length === 0 ? (
                    <WorkspaceSectionEmpty />
                  ) : (
                    sessions.map((session) => (
                      <ChatSessionItem
                        key={session.id}
                        session={session}
                        size="sm"
                        isSelected={session.id === props.activeSessionId}
                        onSelect={props.onSelectSession}
                        onRename={props.onRenameSession}
                        onDelete={props.onDeleteSession}
                      />
                    ))
                  )
                ) : null}
              </SideNavItem>
            </ContextMenu>
          </VStack>
        );
      })}
    </>
  );
}
