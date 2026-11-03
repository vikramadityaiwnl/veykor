import { useEffect, useState } from "react";
import type { AgentDefinition } from "@veykor/shared";
import AgentAvatar from "./components/agent-avatar.tsx";
import AlertDialog from "../components/alert-dialog/alert-dialog.tsx";
import AgentDialog from "./components/agent-dialog.tsx";
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
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm font-light text-zinc-400">
            Create agents and assign them to your projects.
          </p>
        </div>
        <button
          className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950"
          onClick={() => setEditing(null)}
        >
          Create agent
        </button>
      </div>
      {(error || failure) && (
        <p role="alert" className="text-sm text-rose-400">
          {error || failure}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="space-y-4 rounded-2xl border border-zinc-800 p-5"
          >
            <div className="flex items-center gap-3">
              <AgentAvatar name={agent.name} size={40} />
              <h2 className="font-semibold">{agent.name}</h2>
            </div>
            <p className="text-sm font-light text-zinc-400">
              {agent.description || "Ready for project work."}
            </p>
            <div className="flex gap-4 text-xs">
              <button onClick={() => setEditing(agent)}>Edit</button>
              <button
                className="text-zinc-500 hover:text-rose-400"
                onClick={() => setDeleting(agent)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {agents.length === 0 && (
        <p className="py-20 text-center text-sm font-light text-zinc-500">
          Create your first agent to get started.
        </p>
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
  );
}

export default AgentsPage;
