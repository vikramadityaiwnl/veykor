import { useNavigate } from "react-router";
import FolderPicker from "./folder-picker.tsx";
import { FolderIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ProjectInput, WorkProject } from "@veykor/shared";
import Dialog from "../../components/dialog/dialog.tsx";
import AgentAvatar from "../../agents/components/agent-avatar.tsx";
import { useWorkStore } from "../work-store.ts";
import { workRequest } from "../work-client.ts";

interface Props {
  project: WorkProject | null;
  sectionId: string;
  onClose: () => void;
  onSaved: (project: WorkProject) => void;
}

function ProjectDialog(props: Props) {
  const navigate = useNavigate();
  const agents = useWorkStore((state) => state.agents);
  const [draft, setDraft] = useState<ProjectInput>(
    props.project ?? {
      name: "",
      folder: "",
      sectionId: props.sectionId,
      agentIds: [],
    },
  );
  const [picking, setPicking] = useState(false);
  const [nativePicking, setNativePicking] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function chooseFolder() {
    setNativePicking(true);
    setError("");

    try {
      const selected = await workRequest<{ folder: string; name: string }>(
        "projects/pick-folder",
        "POST",
        {},
      );

      if (selected.folder) {
        setDraft((current) => ({
          ...current,
          folder: selected.folder,
          name: current.name || selected.name,
        }));
      }
    } catch {
      setPicking(true);
    } finally {
      setNativePicking(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");

    try {
      const project = await workRequest<WorkProject>(
        props.project ? `projects/${props.project.id}` : "projects",
        props.project ? "PUT" : "POST",
        draft,
      );
      props.onSaved(project);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save project.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog
      size="wide"
      title={props.project ? "Edit project" : "Add project"}
      onClose={props.onClose}
    >
      <form
        className="max-h-[75vh] space-y-6 overflow-y-auto"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center overflow-hidden rounded-xl border border-zinc-700 focus-within:border-zinc-400">
          <button
            type="button"
            aria-label="Choose project folder"
            title={draft.folder || "Choose project folder"}
            disabled={props.project !== null || saving || nativePicking}
            className="shrink-0 px-4 py-3 text-zinc-400 hover:text-zinc-50 disabled:cursor-default"
            onClick={() => void chooseFolder()}
          >
            <FolderIcon className="size-5" />
          </button>
          <input
            aria-label="Project name"
            autoFocus
            placeholder="Project name"
            maxLength={100}
            className="w-full border-l border-zinc-700 bg-transparent px-4 py-3 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500"
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </div>

        {picking && (
          <FolderPicker
            initialPath={draft.folder}
            onCancel={() => setPicking(false)}
            onSelect={(folder, name) => {
              setDraft({ ...draft, folder, name: draft.name || name });
              setPicking(false);
            }}
          />
        )}
        {!picking && draft.folder && (
          <p
            className="truncate text-xs font-light text-zinc-500"
            title={draft.folder}
          >
            {draft.folder}
          </p>
        )}

        <div className="space-y-3">
          <p className="text-sm font-semibold text-zinc-200">Assigned agents</p>
          <div className="flex flex-wrap gap-2">
            {agents.map((agent) => {
              const assigned = draft.agentIds.includes(agent.id);

              return (
                <button
                  key={agent.id}
                  type="button"
                  aria-pressed={assigned}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-light transition ${assigned ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      agentIds: assigned
                        ? draft.agentIds.filter((id) => id !== agent.id)
                        : [...draft.agentIds, agent.id],
                    })
                  }
                >
                  <AgentAvatar name={agent.name} size={24} />
                  {agent.name}
                </button>
              );
            })}
          </div>
          {agents.length === 0 && (
            <p className="text-sm font-light text-zinc-500">
              You can assign agents after creating them from your profile menu.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm font-light text-rose-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-zinc-800 pt-4">
          <button
            type="button"
            className="mr-auto rounded-lg py-2 text-sm font-light text-zinc-400 hover:text-zinc-50"
            onClick={() => {
              props.onClose();
              navigate("/agents");
            }}
          >
            Agents
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-400 hover:bg-zinc-800"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            disabled={saving || !draft.folder || picking || nativePicking}
            className="rounded-lg bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : props.project
                ? "Save changes"
                : "Create project"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default ProjectDialog;
