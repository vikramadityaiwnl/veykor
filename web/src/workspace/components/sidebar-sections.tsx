import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import type { Project, SidebarSection } from "@veykor/shared";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { ContextMenu } from "@astryxdesign/core/ContextMenu";
import { VStack } from "@astryxdesign/core/VStack";
import type { ChatSession } from "../chat-sessions-store";
import { SidebarEmptyState } from "./sidebar-empty-state";
import { WorkspaceChatsList } from "./workspace-chats-list";
import { WorkspaceProjectsList } from "./workspace-projects-list";
import { WorkspaceSection } from "./workspace-section";

interface Props {
  sections: SidebarSection[];
  isReady: boolean;
  error: string;
  visibleProjects: Project[];
  sessions: ChatSession[];
  selectedProjectId: string | null;
  activeSessionId: string | null;
  expandedProjectIds: string[];
  isHost: boolean;
  onSelectProject: (id: string) => void;
  onSelectChatSession: (id: string) => void;
  onSelectProjectSession: (id: string) => void;
  onAddProject: (sectionId: string) => void;
  onAddChat: (sectionId: string) => void;
  onAddProjectSession: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onMoveProject: (projectId: string, sectionId: string) => void;
  onToggleSection: (section: SidebarSection) => void;
  onCreateSection: () => void;
  onEditSection: (section: SidebarSection) => void;
  onDeleteSection: (section: SidebarSection) => void;
  onRetry: () => void;
}

export function SidebarSections(props: Props) {
  function chatSessions(sectionId: string): ChatSession[] {
    return props.sessions.filter(
      (session) =>
        session.projectId === null && session.sectionId === sectionId,
    );
  }

  function sectionProjects(sectionId: string): Project[] {
    return props.visibleProjects.filter(
      (project) => project.sectionId === sectionId,
    );
  }

  function projectSections(): SidebarSection[] {
    return props.sections.filter((section) => section.kind !== "chats");
  }

  function sectionContent(section: SidebarSection) {
    if (section.kind === "chats") {
      return (
        <WorkspaceChatsList
          sessions={chatSessions(section.id)}
          activeSessionId={props.activeSessionId}
          onSelectSession={props.onSelectChatSession}
        />
      );
    }

    return (
      <WorkspaceProjectsList
        projects={sectionProjects(section.id)}
        projectSections={projectSections()}
        sessions={props.sessions}
        selectedProjectId={props.selectedProjectId}
        activeSessionId={props.activeSessionId}
        expandedProjectIds={props.expandedProjectIds}
        onSelectProject={props.onSelectProject}
        onSelectSession={props.onSelectProjectSession}
        onAddSession={props.onAddProjectSession}
        onRenameProject={props.onRenameProject}
        onMoveProject={props.onMoveProject}
      />
    );
  }

  return (
    <ContextMenu
      label="Sidebar actions"
      items={[
        {
          label: "New section",
          icon: <FontAwesomeIcon icon={faPlus} size="sm" aria-hidden="true" />,
          onClick: () => {
            props.onCreateSection();
          },
        },
      ]}
    >
      <VStack
        gap={4}
        className="min-h-[calc(100dvh-calc(var(--spacing-12)*6))] pt-4"
      >
        {props.error ? (
          <>
            <Banner
              status="error"
              title="Sections unavailable"
              description={props.error}
            />
            <Button label="Try again" clickAction={props.onRetry} />
          </>
        ) : !props.isReady ? null : props.sections.length === 0 ? (
          <SidebarEmptyState onCreateSection={props.onCreateSection} />
        ) : (
          props.sections.map((section) => (
            <WorkspaceSection
              key={section.id}
              section={section}
              onToggle={() => {
                props.onToggleSection(section);
              }}
              onAdd={
                section.kind === "chats" || props.isHost
                  ? () => {
                      if (section.kind === "chats") {
                        props.onAddChat(section.id);
                      } else {
                        props.onAddProject(section.id);
                      }
                    }
                  : undefined
              }
              onEdit={() => {
                props.onEditSection(section);
              }}
              onDelete={() => {
                props.onDeleteSection(section);
              }}
            >
              {sectionContent(section)}
            </WorkspaceSection>
          ))
        )}
      </VStack>
    </ContextMenu>
  );
}
