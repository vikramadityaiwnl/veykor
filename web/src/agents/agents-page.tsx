import { PlusIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { AgentDefinition } from "@veykor/shared";
import AgentAvatar from "./components/agent-avatar.tsx";
import AlertDialog from "../components/alert-dialog/alert-dialog.tsx";
import AgentDialog from "./components/agent-dialog.tsx";
import Divider from "../components/divider/divider.tsx";
import EmptyState from "../components/empty-state/empty-state.tsx";
import { useWorkStore } from "../work/work-store.ts";
import { workRequest } from "../work/work-client.ts";

function AgentsPage() {
  const { agents, load, error } = useWorkStore();
  const [editing, setEditing] = useState<AgentDefinition | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<AgentDefinition | null>(null);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    if (!deleting) {
      return;
    }

    try {
      await workRequest(`agents/${deleting.id}`, "DELETE");
      setDeleting(null);
      await load();
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Unable to delete agent.",
      );
      setDeleting(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full space-y-6 px-6 py-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">Agents</h1>

          <p className="text-sm font-light text-zinc-400">
            Create agents and assign them to your projects.
          </p>
        </div>

        <Divider />

        {(error || failure) && (
          <p role="alert" className="text-sm text-rose-400">
            {error || failure}
          </p>
        )}

        {agents.length === 0 ? (
          <div className="py-16">
            <EmptyState
              actionLabel="Add agent"
              description="Create your first agent to get started."
              framedIcon={false}
              iconSize={40}
              onAction={() => setEditing(null)}
              title="No agents yet"
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              aria-label="Add agent"
              onClick={() => setEditing(null)}
              className="grid place-items-center rounded-2xl border border-dashed border-zinc-700 transition hover:bg-zinc-900"
            >
              <EmptyState
                title="Add agent"
                icon={
                  <PlusIcon
                    aria-hidden="true"
                    className="size-5 text-zinc-500"
                  />
                }
              />
            </button>

            {agents.map((agent) => (
              <div
                key={agent.id}
                className="cursor-pointer space-y-4 rounded-2xl border border-zinc-800 p-5 transition hover:border-zinc-700"
                onClick={() => setEditing(agent)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setEditing(agent);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center gap-3">
                  <AgentAvatar name={agent.name} size={40} />
                  <h2 className="font-semibold">{agent.name}</h2>
                </div>

                <p className="text-sm font-light text-zinc-400">
                  {agent.description || "Ready for project work."}
                </p>

                <div className="flex gap-4 text-xs">
                  <button
                    className="text-zinc-500 hover:text-rose-400"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleting(agent);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editing !== undefined && (
          <AgentDialog
            agent={editing}
            onClose={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              void load();
            }}
          />
        )}

        {deleting && (
          <AlertDialog
            title="Delete agent"
            description={`Remove ${deleting.name} from your library and projects? Existing sessions keep their saved configuration.`}
            confirmLabel="Delete"
            onClose={() => setDeleting(null)}
            onConfirm={() => void remove()}
          />
        )}
      </div>
    </div>
  );
}

export default AgentsPage;
