import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FolderIcon } from "@heroicons/react/24/outline";
import { defaultProjectSectionId } from "@veykor/shared";
import { fetchStatus } from "../../auth/auth-client.ts";
import GitTreeIcon from "../../components/icons/git-tree-icon.tsx";
import { useChatStore } from "../../chat/chat-store.ts";
import ProjectDialog from "./project-dialog.tsx";
import { useWorkStore } from "../work-store.ts";

function ProjectComposerContext() {
  const { projectId, projects, load } = useWorkStore();
  const project = projects.find((entry) => entry.id === projectId);
  const [adding, setAdding] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void fetchStatus().then((status) =>
      setCanCreate(status.registrationAllowed),
    );
  }, []);

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-b-3xl border border-t-0 border-zinc-700 bg-zinc-900/70 px-4 py-3 text-xs font-light text-zinc-400 backdrop-blur-xl">
        <button
          type="button"
          disabled={!!project || !canCreate}
          onClick={() => setAdding(true)}
          className="flex min-w-0 items-center gap-2 text-left enabled:hover:text-zinc-50 disabled:cursor-default"
          title={
            project?.folder ??
            (canCreate ? "Add project" : "Add projects from the host computer")
          }
        >
          <FolderIcon className="size-4 shrink-0" />
          <span className="truncate">{project?.name ?? "Add Project"}</span>
        </button>
        {project && (
          <span className="flex min-w-0 items-center gap-2">
            <GitTreeIcon className="size-4 shrink-0" />
            <span className="truncate">{project.branch}</span>
          </span>
        )}
      </div>
      {adding && (
        <ProjectDialog
          project={null}
          sectionId={defaultProjectSectionId}
          onClose={() => setAdding(false)}
          onSaved={(created) => {
            setAdding(false);
            void load();
            useChatStore.getState().startDraft("recent");
            useWorkStore.getState().selectProject(created.id);
            navigate(`/work/${created.id}`);
          }}
        />
      )}
    </>
  );
}

export default ProjectComposerContext;
