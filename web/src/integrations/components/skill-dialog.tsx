import { useState } from "react";
import type {
  CreateSkillRequest,
  SkillDetail,
  UpdateSkillRequest,
} from "@veykor/shared";
import { filterSkillName } from "@veykor/shared";
import Dialog from "../../components/dialog/dialog.tsx";
import SegmentedControl from "../../components/segmented-control/segmented-control.tsx";
import { createSkill, updateSkill } from "../integrations-client.ts";

interface Props {
  onClose: () => void;
  onSaved: () => void;
  skill: SkillDetail | null;
}

const fieldClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40";

function deniesKey(value: string, key: string): boolean {
  if (key.length !== 1) {
    return false;
  }

  return filterSkillName(value + key) === filterSkillName(value);
}

function SkillDialog(props: Props) {
  const creating = props.skill === null;

  const [name, setName] = useState(props.skill?.name ?? "");
  const [description, setDescription] = useState(
    props.skill?.description ?? "",
  );
  const [instructions, setInstructions] = useState(
    props.skill?.instructions ?? "",
  );
  const [enabled, setEnabled] = useState(props.skill?.enabled ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");

    try {
      if (creating) {
        const input: CreateSkillRequest = {
          name,
          description,
          instructions,
          enabled,
        };

        await createSkill(input);
      } else {
        const input: UpdateSkillRequest = {
          name,
          description,
          instructions,
          enabled,
        };

        await updateSkill(props.skill?.id ?? "", input);
      }

      props.onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save the skill.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog
      size="wide"
      title={creating ? "Add skill" : "Edit skill"}
      description={
        creating
          ? "Enabled skills become available to new chats."
          : "Changes apply to new chats."
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
        <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <label
            htmlFor="skill-name"
            className="text-sm font-light text-zinc-400"
          >
            Name
          </label>

          <div className="space-y-1.5">
            <input
              autoFocus
              className={fieldClass}
              id="skill-name"
              maxLength={100}
              onChange={(event) => setName(filterSkillName(event.target.value))}
              onKeyDown={(event) => {
                if (deniesKey(name, event.key)) {
                  event.preventDefault();
                }
              }}
              onPaste={(event) => event.preventDefault()}
              placeholder="my-skill"
              type="text"
              value={name}
            />
          </div>
        </div>

        <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <label
            htmlFor="skill-description"
            className="pt-2 text-sm font-light text-zinc-400"
          >
            Description
          </label>

          <textarea
            className={fieldClass}
            id="skill-description"
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="One sentence the model reads when deciding to use it"
            rows={2}
            value={description}
          />
        </div>

        <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <label
            htmlFor="skill-instructions"
            className="pt-2 text-sm font-light text-zinc-400"
          >
            Instructions
          </label>

          <textarea
            className={fieldClass}
            id="skill-instructions"
            maxLength={50000}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="When and how to use this skill"
            rows={8}
            value={instructions}
          />
        </div>

        <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <p className="text-sm font-light text-zinc-400">Enabled</p>

          <div className="w-44">
            <SegmentedControl
              label="Skill enabled"
              onChange={(value) => setEnabled(value === "enabled")}
              options={[
                { label: "Enabled", value: "enabled" },
                { label: "Disabled", value: "disabled" },
              ]}
              size="sm"
              value={enabled ? "enabled" : "disabled"}
            />
          </div>
        </div>

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
            {saving ? "Saving…" : creating ? "Add skill" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default SkillDialog;
