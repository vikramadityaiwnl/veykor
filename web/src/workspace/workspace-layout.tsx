import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Project, SidebarSection } from "@veykor/shared";
import { AppShell } from "@astryxdesign/core/AppShell";
import { CommandPalette } from "@astryxdesign/core/CommandPalette";
import { SideNav } from "@astryxdesign/core/SideNav";
import { createStaticSource } from "@astryxdesign/core/Typeahead";
import { VStack } from "@astryxdesign/core/VStack";
import { useAuthStore } from "../auth/auth-store";
import { useChatSessionsStore, type ChatSession } from "./chat-sessions-store";
import { useProjectsStore } from "./projects-store";
import { useSidebarSectionsStore } from "./sidebar-sections-store";
import { AddProjectDialog } from "./components/add-project-dialog";
import { DeleteSectionDialog } from "./components/delete-section-dialog";
import { RenameProjectDialog } from "./components/rename-project-dialog";
import { SectionFormDialog, type SectionDialogState } from "./components/section-form-dialog";
import { SidebarSections } from "./components/sidebar-sections";
import { WorkspaceSidebarFooter } from "./components/workspace-sidebar-footer";
import { WorkspaceSidebarHeader } from "./components/workspace-sidebar-header";
import { WorkspaceSidebarTopContent } from "./components/workspace-sidebar-top-content";

import { ChatThreadHeader } from "./components/chat-thread-header";
import { RenameChatDialog } from "./components/rename-chat-dialog";
import { DeleteChatDialog } from "./components/delete-chat-dialog";
import { useChatRuntimeStore } from "./chat-runtime-store";

const commandPaletteSource = createStaticSource([]);

export interface WorkspaceOutletContext {
  project: Project | null;
}

export function WorkspaceLayout() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [chatDialog, setChatDialog] = useState<{
    mode: "rename" | "delete";
    session: ChatSession;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [addProjectSectionId, setAddProjectSectionId] = useState<string | null>(
    null,
  );
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const [sectionDialog, setSectionDialog] = useState<SectionDialogState | null>(
    null,
  );
  const [sectionPendingDelete, setSectionPendingDelete] =
    useState<SidebarSection | null>(null);

  const userId = useAuthStore((state) => state.status?.user?.id ?? null);
  const isHost = useAuthStore(
    (state) => state.status?.registrationAllowed ?? false,
  );
  const sections = useSidebarSectionsStore((state) => state.sections);
  const sectionsStatus = useSidebarSectionsStore((state) => state.status);
  const sectionsError = useSidebarSectionsStore((state) => state.error);
  const loadSections = useSidebarSectionsStore((state) => state.loadSections);
  const createSection = useSidebarSectionsStore((state) => state.createSection);
  const renameSection = useSidebarSectionsStore((state) => state.renameSection);
  const deleteSection = useSidebarSectionsStore((state) => state.deleteSection);
  const toggleSection = useSidebarSectionsStore((state) => state.toggleSection);
  const projects = useProjectsStore((state) => state.projects);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const createProject = useProjectsStore((state) => state.createProject);
  const renameProject = useProjectsStore((state) => state.renameProject);
  const moveProject = useProjectsStore((state) => state.moveProject);
  const sessions = useChatSessionsStore((state) => state.sessions);
  const activeSessionId = useChatSessionsStore(
    (state) => state.activeSessionId,
  );
  const selectSession = useChatSessionsStore((state) => state.selectSession);

  useEffect(() => {
    void loadSections();
    void loadProjects();
  }, [loadProjects, loadSections, userId]);

  const project =
    projects.find((item) => item.id === selectedProjectId) ?? null;

  const needle = query.trim().toLowerCase();

  const visibleProjects = needle
    ? projects.filter((item) => item.name.toLowerCase().includes(needle))
    : projects;

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;

  const visibleSessions = sessions;

  const renameProjectTarget =
    projects.find((item) => item.id === renameProjectId) ?? null;

  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const chatStatus = useChatSessionsStore((state) => state.status);
  const loadChats = useChatSessionsStore((state) => state.load);

  useEffect(() => {
    if (userId !== null) {
      void loadChats();
    }
  }, [userId, loadChats]);

  useEffect(() => {
    if (chatStatus === "ready") {
      selectSession(
        sessionId && sessions.some((session) => session.id === sessionId)
          ? sessionId
          : null,
      );
    }
  }, [sessionId, chatStatus, sessions, selectSession]);

  const isHome =
    location.pathname === "/" || location.pathname.startsWith("/chat/");

  function selectProject(id: string) {
    navigate("/");
    setSelectedProjectId(id);
    selectSession(null);
    setExpandedProjectIds((current) =>
      current.includes(id)
        ? current.filter((existing) => existing !== id)
        : [...current, id],
    );
  }

  function selectChatSession(id: string) {
    navigate(`/chat/${id}`);
    selectSession(id);
    setSelectedProjectId(null);
  }

  function selectProjectSession(id: string) {
    navigate(`/chat/${id}`);
    selectSession(id);
    setSelectedProjectId(null);
  }

  function addChat(sectionId: string) {
    selectSession(null);
    setSelectedProjectId(null);
    navigate("/", {
      state: { draft: { id: crypto.randomUUID(), sectionId, projectId: "" } },
    });
  }

  function addProjectSession(projectId: string) {
    selectSession(null);
    setSelectedProjectId(null);
    navigate("/", {
      state: { draft: { id: crypto.randomUUID(), sectionId: "", projectId } },
    });
  }

  function moveProjectToSection(projectId: string, sectionId: string) {
    void moveProject(projectId, sectionId);
  }

  async function submitCreateProject(input: {
    name: string;
    folder: string;
  }): Promise<boolean> {
    if (!addProjectSectionId) {
      return false;
    }

    return createProject({ ...input, sectionId: addProjectSectionId });
  }

  async function submitRenameProject(name: string): Promise<boolean> {
    if (!renameProjectId) {
      return false;
    }

    return renameProject(renameProjectId, name);
  }

  async function submitSection(input: {
    title: string;
    kind: "chats" | "projects";
  }): Promise<boolean> {
    if (!sectionDialog) {
      return false;
    }

    if (sectionDialog.mode === "create") {
      return createSection(input.title, input.kind);
    }

    return renameSection(sectionDialog.section.id, input.title);
  }

  async function confirmDeleteSection(): Promise<boolean> {
    if (!sectionPendingDelete) {
      return false;
    }

    const deleted = await deleteSection(sectionPendingDelete.id);

    if (!deleted) {
      return false;
    }

    await loadProjects();

    const remainingIds = new Set(
      useProjectsStore.getState().projects.map((project) => project.id),
    );

    if (selectedProjectId !== null && !remainingIds.has(selectedProjectId)) {
      setSelectedProjectId(null);
    }

    setExpandedProjectIds((current) =>
      current.filter((id) => remainingIds.has(id)),
    );

    return true;
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
            <WorkspaceSidebarHeader
              isCollapsed={isSidebarCollapsed}
              onHome={() => {
                setSelectedProjectId(null);
                selectSession(null);
              }}
            />
          }
          topContent={
            <WorkspaceSidebarTopContent
              isCollapsed={isSidebarCollapsed}
              isCommandPaletteOpen={isCommandPaletteOpen}
              query={query}
              onQueryChange={setQuery}
              onExpandSidebar={() => {
                setIsSidebarCollapsed(false);
              }}
              onOpenCommandPalette={() => {
                setIsCommandPaletteOpen(true);
              }}
            />
          }
          footer={<WorkspaceSidebarFooter />}
        >
          {isSidebarCollapsed ? null : (
            <SidebarSections
              sections={sections}
              isReady={sectionsStatus === "ready" || sections.length > 0}
              error={sectionsStatus === "error" ? sectionsError : ""}
              visibleProjects={visibleProjects}
              sessions={visibleSessions}
              onRenameSession={(session) =>
                setChatDialog({ mode: "rename", session })
              }
              onDeleteSession={(session) =>
                setChatDialog({ mode: "delete", session })
              }
              selectedProjectId={selectedProjectId}
              activeSessionId={activeSessionId}
              expandedProjectIds={expandedProjectIds}
              isHost={isHost}
              onSelectProject={selectProject}
              onSelectChatSession={selectChatSession}
              onSelectProjectSession={selectProjectSession}
              onAddProject={(sectionId) => {
                setAddProjectSectionId(sectionId);
                setIsAddProjectOpen(true);
              }}
              onAddChat={addChat}
              onAddProjectSession={addProjectSession}
              onRenameProject={setRenameProjectId}
              onMoveProject={moveProjectToSection}
              onToggleSection={(section) => {
                void toggleSection(section);
              }}
              onCreateSection={() => {
                setSectionDialog({ mode: "create" });
              }}
              onEditSection={(section) => {
                setSectionDialog({ mode: "edit", section });
              }}
              onDeleteSection={setSectionPendingDelete}
              onRetry={() => {
                void loadSections();
              }}
            />
          )}
        </SideNav>
      }
    >
      <VStack minHeight="100%" gap={0}>
        {isHome ? (
          <ChatThreadHeader
            title={
              sessionId && activeSession ? activeSession.title : "New Chat"
            }
            onRename={
              sessionId && activeSession
                ? () =>
                    setChatDialog({ mode: "rename", session: activeSession })
                : undefined
            }
            onDelete={
              sessionId && activeSession
                ? () =>
                    setChatDialog({ mode: "delete", session: activeSession })
                : undefined
            }
          />
        ) : null}

        <Outlet context={{ project } satisfies WorkspaceOutletContext} />
      </VStack>
      <RenameChatDialog
        key={`${chatDialog?.session.id}-${chatDialog?.mode}`}
        session={chatDialog?.mode === "rename" ? chatDialog.session : null}
        onClose={() => setChatDialog(null)}
        onSubmit={(title) =>
          chatDialog
            ? useChatSessionsStore
                .getState()
                .renameSession(chatDialog.session.id, title)
            : Promise.resolve(false)
        }
      />
      <DeleteChatDialog
        session={chatDialog?.mode === "delete" ? chatDialog.session : null}
        onCancel={() => setChatDialog(null)}
        onConfirm={async () => {
          if (!chatDialog) {
            return false;
          }
          const targetId = chatDialog.session.id;
          if (useChatRuntimeStore.getState().runningSessionId === targetId) {
            useChatRuntimeStore.getState().stop();
          }
          const deleted = await useChatSessionsStore
            .getState()
            .deleteSession(targetId);
          if (deleted) {
            setChatDialog(null);
            if (sessionId === targetId) {
              setSelectedProjectId(null);
              navigate("/");
            }
          }
          return deleted;
        }}
      />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        searchSource={commandPaletteSource}
      />
      <AddProjectDialog
        key={isAddProjectOpen ? "add-project-open" : "add-project-closed"}
        isOpen={isAddProjectOpen}
        onClose={() => {
          setIsAddProjectOpen(false);
          setAddProjectSectionId(null);
        }}
        onSubmit={submitCreateProject}
      />
      <RenameProjectDialog
        key={renameProjectId ?? "rename-project-closed"}
        project={renameProjectTarget}
        onClose={() => {
          setRenameProjectId(null);
        }}
        onSubmit={submitRenameProject}
      />
      <SectionFormDialog
        key={
          sectionDialog?.mode === "edit"
            ? `section-edit-${sectionDialog.section.id}`
            : sectionDialog?.mode === "create"
              ? "section-create"
              : "section-closed"
        }
        dialog={sectionDialog}
        onClose={() => {
          setSectionDialog(null);
        }}
        onSubmit={submitSection}
      />
      <DeleteSectionDialog
        section={sectionPendingDelete}
        projectCount={
          sectionPendingDelete === null
            ? 0
            : projects.filter(
                (project) => project.sectionId === sectionPendingDelete.id,
              ).length
        }
        onCancel={() => {
          setSectionPendingDelete(null);
        }}
        onConfirm={confirmDeleteSection}
      />
    </AppShell>
  );
}
