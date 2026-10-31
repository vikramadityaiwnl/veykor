import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment, faFolder, faFolderOpen, faFolderTree, faPen, faPlus } from "@fortawesome/free-solid-svg-icons";
import type { Project, SidebarSection } from "@veykor/shared";
import { Button } from "@astryxdesign/core/Button";
import { ContextMenu, type ContextMenuOption } from "@astryxdesign/core/ContextMenu";
import { SideNavItem } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/VStack";
import type { ChatSession } from "../chat-sessions-store";
import { WorkspaceSectionEmpty } from "./workspace-section-empty";

interface Props {
  projects: Project[];
  projectSections: SidebarSection[];
  sessions: ChatSession[];
  selectedProjectId: string | null;
  activeSessionId: string | null;
  expandedProjectIds: string[];
  onSelectProject: (id: string) => void;
  onSelectSession: (id: string) => void;
  onAddSession: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onMoveProject: (projectId: string, sectionId: string) => void;
}

export function WorkspaceProjectsList(props: Props) {
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
    ];
  }

  return (
    <>
      {props.projects.map((item) => {
        const sessions = sessionsFor(item.id);
        const isExpanded = props.expandedProjectIds.includes(item.id);

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
                    icon={faFolder}
                    size="sm"
                    aria-hidden="true"
                  />
                }
                selectedIcon={
                  <FontAwesomeIcon
                    icon={faFolderOpen}
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
                    className="!border-0 !bg-transparent !shadow-none text-(--color-icon-secondary) opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:!bg-none hover:!bg-none hover:text-(--color-text-primary) [@media(hover:none)]:opacity-100"
                    icon={
                      <FontAwesomeIcon
                        icon={faPlus}
                        size="sm"
                        aria-hidden="true"
                      />
                    }
                    clickAction={() => {
                      props.onAddSession(item.id);
                    }}
                  />
                }
              >
                {isExpanded ? (
                  sessions.length === 0 ? (
                    <WorkspaceSectionEmpty />
                  ) : (
                    sessions.map((session) => (
                      <SideNavItem
                        key={session.id}
                        label={session.title}
                        size="sm"
                        icon={
                          <FontAwesomeIcon
                            icon={faComment}
                            size="sm"
                            aria-hidden="true"
                          />
                        }
                        isSelected={session.id === props.activeSessionId}
                        onClick={() => {
                          props.onSelectSession(session.id);
                        }}
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
