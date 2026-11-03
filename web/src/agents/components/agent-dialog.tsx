import { CubeIcon } from "@heroicons/react/24/outline";
import PermissionIcon from "../../chat/components/permission-icon.tsx";
import { useEffect, useState } from "react";
import type {
  AgentDefinition,
  AgentInput,
  ChatModelCatalog,
} from "@veykor/shared";
import Dialog from "../../components/dialog/dialog.tsx";
import AgentAvatar from "./agent-avatar.tsx";
import Selector from "../../components/selector/selector.tsx";
import { chatPermissions } from "@veykor/shared";
import { workRequest } from "../../work/work-client.ts";

interface Props {
  agent: AgentDefinition | null;
  onClose: () => void;
  onSaved: () => void;
}

const emptyAgent: AgentInput = {
  name: "",
  description: "",
  avatar: "",
  instructions: "",
  modelId: "",
  providerId: "",
  reasoningEffort: "",
  permission: "read-only",
};
const fieldClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-light text-zinc-100 outline-none focus:border-zinc-400";

function AgentDialog(props: Props) {
  const [draft, setDraft] = useState<AgentInput>(props.agent ?? emptyAgent);
  const [catalog, setCatalog] = useState<ChatModelCatalog>({
    providerId: "",
    source: "",
    models: [],
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const model = catalog.models.find(
    (entry) =>
      entry.modelId === draft.modelId && entry.providerId === draft.providerId,
  );

  useEffect(() => {
    void workRequest<ChatModelCatalog>("models")
      .then(setCatalog)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  async function save() {
    setSaving(true);
    setError("");

    try {
      await workRequest(
        props.agent ? `agents/${props.agent.id}` : "agents",
        props.agent ? "PUT" : "POST",
        {
          ...draft,
          avatar: "",
          ...(draft.modelId === ""
            ? { reasoningEffort: "", permission: "read-only" }
            : {}),
        },
      );
      props.onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save agent.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog
      size="wide"
      title={props.agent ? "Edit agent" : "Create agent"}
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
          <AgentAvatar name={draft.name} size={40} />
          <input
            aria-label="Agent name"
            id="agent-name"
            autoFocus
            required
            placeholder="Name your agent"
            maxLength={100}
            className={fieldClass}
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </div>

        <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <label
            htmlFor="agent-description"
            className="pt-2 text-sm font-light text-zinc-400"
          >
            Description
          </label>
          <input
            id="agent-description"
            placeholder="What does this agent do?"
            maxLength={500}
            className={fieldClass}
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
        </div>

        <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <label
            htmlFor="agent-instructions"
            className="pt-2 text-sm font-light text-zinc-400"
          >
            Instructions
          </label>
          <textarea
            id="agent-instructions"
            placeholder="Describe how your agent should work…"
            rows={5}
            maxLength={20000}
            className={fieldClass}
            value={draft.instructions}
            onChange={(event) =>
              setDraft({ ...draft, instructions: event.target.value })
            }
          />
        </div>

        <div className="space-y-4 border-t border-zinc-800 pt-5">
          <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
            <p className="text-sm font-light text-zinc-400">Model</p>
            <Selector
              label="Agent model"
              value={model ? `${draft.providerId}/${draft.modelId}` : ""}
              options={[
                {
                  value: "",
                  label: "Default model",
                  icon: <CubeIcon className="size-4 shrink-0 text-zinc-400" />,
                },
                ...catalog.models.map((entry) => ({
                  value: `${entry.providerId}/${entry.modelId}`,
                  label: entry.displayLabel,
                  icon: <CubeIcon className="size-4 shrink-0 text-zinc-400" />,
                })),
              ]}
              onChange={(value) => {
                const next = catalog.models.find(
                  (entry) => `${entry.providerId}/${entry.modelId}` === value,
                );

                setDraft({
                  ...draft,
                  modelId: next?.modelId ?? "",
                  providerId: next?.providerId ?? "",
                  reasoningEffort: next?.defaultReasoningEffort ?? "",
                  permission: next ? draft.permission : "read-only",
                });
              }}
            />
          </div>
          <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
            <p className="text-sm font-light text-zinc-400">Thinking</p>
            <Selector
              label="Agent thinking"
              disabled={draft.modelId === ""}
              value={draft.reasoningEffort}
              options={[
                { value: "", label: "Default" },
                ...(model?.variants ?? []).map((effort) => ({
                  value: effort,
                  label: effort.charAt(0).toUpperCase() + effort.slice(1),
                })),
              ]}
              onChange={(reasoningEffort) =>
                setDraft({ ...draft, reasoningEffort })
              }
            />
          </div>
          <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
            <p className="text-sm font-light text-zinc-400">Permissions</p>
            <Selector
              label="Agent permissions"
              disabled={draft.modelId === ""}
              value={draft.permission}
              options={chatPermissions.map((entry) => ({
                value: entry.value,
                label: entry.title,
                description: entry.description,
                icon: <PermissionIcon permission={entry.value} />,
                danger: entry.value === "full-access",
              }))}
              onChange={(permission) =>
                setDraft({
                  ...draft,
                  permission: permission as AgentInput["permission"],
                })
              }
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm font-light text-rose-400">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-400 hover:bg-zinc-800"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded-lg bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
          >
            {saving ? "Saving…" : props.agent ? "Save changes" : "Create agent"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default AgentDialog;
