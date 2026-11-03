import ContextMenu from "../../components/context-menu/context-menu.tsx";
import AlertDialog from "../../components/alert-dialog/alert-dialog.tsx";
import { TrashIcon } from "@heroicons/react/24/outline";
import { workRequest } from "../work-client.ts";
import type { MouseEvent } from "react";
import { defaultProjectSectionId } from "@veykor/shared";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { fetchStatus } from "../../auth/auth-client.ts";
import CollapsibleSection from "../../components/collapsible-section/collapsible-section.tsx";
import { usePreferencesStore } from "../../workspace/preferences-store.ts";
import { useChatStore } from "../../chat/chat-store.ts";
import { useWorkStore } from "../work-store.ts";
import ProjectDialog from "./project-dialog.tsx";
import type { WorkProject } from "@veykor/shared";

interface Props {
  query: string;
  onSectionMenu: (
    event: MouseEvent<HTMLButtonElement>,
    sectionId: string,
  ) => void;
}

function WorkSidebar(props: Props) {
  const { projects, load, error } = useWorkStore();
  const activeProjectId = useWorkStore((state) => state.projectId);
  const [collapsedProjects, setCollapsedProjects] = useState<
    Record<string, boolean>
  >({});
  const sections = usePreferencesStore((state) => state.workSections);
  const setSectionOpen = usePreferencesStore((state) => state.setSectionOpen);
  const chats = useChatStore((state) => state.chats);
  const activeChatId = useChatStore((state) => state.activeChatId);
  const navigate = useNavigate();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    project: WorkProject;
  } | null>(null);
  const [deleting, setDeleting] = useState<WorkProject | null>(null);
  const [failure, setFailure] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [dialog, setDialog] = useState<{
    project: WorkProject | null;
    sectionId: string;
  } | null>(null);

  useEffect(() => {
    void load();
    void fetchStatus().then((status) =>
      setCanCreate(status.registrationAllowed),
    );
  }, [load]);

  function openProject(id: string) {
    setCollapsedProjects((current) => ({ ...current, [id]: false }));
    useChatStore.getState().startDraft("recent");
    useWorkStore.getState().selectProject(id);
    navigate(`/work/${encodeURIComponent(id)}`);
  }

  return (
    <div className="space-y-4">
      {failure && (
        <p role="alert" className="text-xs text-rose-400">
          {failure}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      )}
      {sections.map((section) => (
        <CollapsibleSection
          key={section.id}
          title={section.title}
          onTitleContextMenu={(event) => props.onSectionMenu(event, section.id)}
          open={section.open}
          onToggle={() => setSectionOpen(section.id, !section.open)}
          action={
            canCreate ? (
              <button
                aria-label={`Add project to ${section.title}`}
                title="Add project"
                className="pointer-events-none grid size-7 place-items-center text-zinc-500 opacity-0 hover:text-zinc-50 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/section:pointer-events-auto group-hover/section:opacity-100"
                onClick={() =>
                  setDialog({ project: null, sectionId: section.id })
                }
              >
                <PlusIcon className="size-4" />
              </button>
            ) : undefined
          }
        >
          <div className="space-y-2">
            {projects
              .filter(
                (project) =>
                  (project.sectionId === section.id ||
                    (section.id === defaultProjectSectionId &&
                      !sections.some(
                        (entry) => entry.id === project.sectionId,
                      ))) &&
                  (project.name
                    .toLowerCase()
                    .includes(props.query.toLowerCase()) ||
                    chats.some(
                      (chat) =>
                        chat.projectId === project.id &&
                        chat.title
                          .toLowerCase()
                          .includes(props.query.toLowerCase()),
                    )),
              )
              .map((project) => (
                <div
                  key={project.id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMenu({ x: event.clientX, y: event.clientY, project });
                  }}
                >
                  <div className="group/project flex items-center gap-1 rounded-lg hover:bg-zinc-900">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm text-zinc-300"
                      aria-expanded={
                        !collapsedProjects[project.id] ||
                        props.query.trim() !== ""
                      }
                      onClick={() => {
                        if (activeProjectId === project.id) {
                          setCollapsedProjects((current) => ({
                            ...current,
                            [project.id]: !current[project.id],
                          }));
                        } else {
                          openProject(project.id);
                        }
                      }}
                    >
                      <ChevronRightIcon
                        className={`size-3 shrink-0 ${!collapsedProjects[project.id] || props.query.trim() !== "" ? "rotate-90" : ""}`}
                      />
                      {activeProjectId === project.id ? (
                        <FolderOpenIcon className="size-4 shrink-0" />
                      ) : (
                        <FolderIcon className="size-4 shrink-0" />
                      )}
                      <span className="truncate">{project.name}</span>
                    </button>
                    <button
                      aria-label={`Edit ${project.name}`}
                      className="pointer-events-none p-1 text-zinc-500 opacity-0 hover:text-zinc-50 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/project:pointer-events-auto group-hover/project:opacity-100"
                      onClick={() =>
                        setDialog({ project, sectionId: section.id })
                      }
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                    <button
                      aria-label={`New session in ${project.name}`}
                      className="pointer-events-none p-1 text-zinc-500 opacity-0 hover:text-zinc-50 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/project:pointer-events-auto group-hover/project:opacity-100"
                      onClick={() => openProject(project.id)}
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  </div>
                  {(!collapsedProjects[project.id] ||
                    props.query.trim() !== "") && (
                    <div className="ml-7 space-y-1 border-l border-zinc-800 pl-3">
                      {chats
                        .filter(
                          (chat) =>
                            chat.projectId === project.id &&
                            chat.title
                              .toLowerCase()
                              .includes(props.query.toLowerCase()),
                        )
                        .map((chat) => (
                          <button
                            key={chat.id}
                            className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs ${activeChatId === chat.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"}`}
                            onClick={() =>
                              navigate(`/work/${project.id}/chat/${chat.id}`)
                            }
                          >
                            {chat.title}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </CollapsibleSection>
      ))}
      {projects.length === 0 && (
        <p className="px-2 text-xs font-light text-zinc-500">
          {canCreate
            ? "Add a project folder to start working."
            : "Add project folders from the host computer."}
        </p>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              kind: "item",
              id: "edit",
              label: "Edit",
              icon: <PencilIcon className="size-4" />,
            },
            { kind: "divider" },
            {
              kind: "item",
              id: "delete",
              label: "Delete",
              danger: true,
              icon: <TrashIcon className="size-4 text-red-400" />,
            },
          ]}
          onSelect={(item) => {
            if (item.id === "edit") {
              setDialog({
                project: menu.project,
                sectionId: menu.project.sectionId,
              });
            } else {
              setDeleting(menu.project);
            }
            setMenu(null);
          }}
        />
      )}
      {deleting && (
        <AlertDialog
          title="Delete project"
          description={`Remove ${deleting.name} and its sessions from veykor? The folder and its files stay on your computer.`}
          confirmLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            void workRequest(`projects/${deleting.id}`, "DELETE")
              .then(async () => {
                if (useWorkStore.getState().projectId === deleting.id) {
                  useWorkStore.getState().selectProject("");
                  useChatStore.getState().startDraft("recent");
                  navigate("/work");
                }
                setDeleting(null);
                await Promise.all([
                  load(),
                  useChatStore.getState().loadChats(),
                ]);
              })
              .catch((cause: Error) => {
                setFailure(cause.message);
                setDeleting(null);
              });
          }}
        />
      )}
      {dialog && (
        <ProjectDialog
          project={dialog.project}
          sectionId={dialog.sectionId}
          onClose={() => setDialog(null)}
          onSaved={(project) => {
            const created = dialog.project === null;

            setDialog(null);
            void load();

            if (created) {
              openProject(project.id);
            }
          }}
        />
      )}
    </div>
  );
}

export default WorkSidebar;
