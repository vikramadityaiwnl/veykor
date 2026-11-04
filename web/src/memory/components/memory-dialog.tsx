import { useState } from "react";
import type { MemoryDetail, MemoryScope } from "@veykor/shared";
import type { WorkProject } from "@veykor/shared";
import Dialog from "../../components/dialog/dialog.tsx";
import SegmentedControl from "../../components/segmented-control/segmented-control.tsx";
import Selector from "../../components/selector/selector.tsx";
import { createMemory, updateMemory } from "../memory-client.ts";

interface Props {
  onClose: () => void;
  onSaved: () => void;
  memory: MemoryDetail | null;
  projects: Array<WorkProject>;
}

const fieldClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40";

function MemoryDialog(props: Props) {
  const creating = props.memory === null;

  const [instruction, setInstruction] = useState(
    props.memory?.instruction ?? "",
  );
  const [scope, setScope] = useState<MemoryScope>(
    props.memory?.scope ?? "global",
  );
  const [projectId, setProjectId] = useState(props.memory?.projectId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");

    try {
      if (creating) {
        await createMemory({
          instruction,
          scope,
          projectId: scope === "project" ? projectId : "",
        });
      } else if (props.memory) {
        await updateMemory(props.memory.id, {
          instruction,
          scope,
          projectId: scope === "project" ? projectId : "",
          expectedUpdatedAt: props.memory.updatedAt,
        });
      }

      props.onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save the memory.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog
      size="wide"
      title={creating ? "Add memory" : "Edit memory"}
      description={
        creating
          ? "Teach veykor a preference, rule, or procedure for future chats."
          : "Changes apply to subsequent turns."
      }
      onClose={props.onClose}
    >
      <form
        className="max-h-[75vh] space-y-6 overflow-y-auto"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <label
            htmlFor="memory-instruction"
            className="pt-2 text-sm font-light text-zinc-400"
          >
            Instruction
          </label>

          <textarea
            autoFocus
            className={fieldClass}
            id="memory-instruction"
            maxLength={2000}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Always run the tests before claiming work is done."
            rows={4}
            value={instruction}
          />
        </div>

        <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <p className="text-sm font-light text-zinc-400">Scope</p>

          <div className="w-56">
            <SegmentedControl
              label="Memory scope"
              onChange={(value) => {
                setScope(value);
                if (value === "global") {
                  setProjectId("");
                }
              }}
              options={[
                { label: "Global", value: "global" },
                { label: "Project", value: "project" },
              ]}
              size="sm"
              value={scope}
            />
          </div>
        </div>

        {scope === "project" && (
          <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
            <label
              htmlFor="memory-project"
              className="text-sm font-light text-zinc-400"
            >
              Project
            </label>

            <Selector
              label="Memory project"
              onChange={setProjectId}
              options={props.projects.map((project) => ({
                label: project.name,
                value: project.id,
              }))}
              placeholder={
                props.projects.length === 0
                  ? "No projects yet"
                  : "Choose a project"
              }
              value={projectId}
            />
          </div>
        )}

        {error !== "" && (
          <p className="text-sm font-light text-rose-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
          <button
            className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-400 hover:bg-zinc-800"
            onClick={props.onClose}
            type="button"
          >
            Cancel
          </button>

          <button
            className="rounded-lg bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            disabled={saving}
          >
            {saving ? "Saving…" : creating ? "Add memory" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default MemoryDialog;
