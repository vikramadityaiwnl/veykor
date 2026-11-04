import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { MemoryDetail, MemorySummary } from "@veykor/shared";
import AlertDialog from "../components/alert-dialog/alert-dialog.tsx";
import Divider from "../components/divider/divider.tsx";
import EmptyState from "../components/empty-state/empty-state.tsx";
import LoadingSpinner from "../components/loading-spinner/loading-spinner.tsx";
import { useWorkStore } from "../work/work-store.ts";
import MemoryDialog from "./components/memory-dialog.tsx";
import MemoryFilters from "./components/memory-filters.tsx";
import MemoryList from "./components/memory-list.tsx";
import { deleteMemory, fetchMemory } from "./memory-client.ts";
import { useMemoryStore } from "./memory-store.ts";

function MemoryPage() {
  const memories = useMemoryStore((state) => state.memories);
  const loaded = useMemoryStore((state) => state.loaded);
  const loading = useMemoryStore((state) => state.loading);
  const error = useMemoryStore((state) => state.error);
  const scopeFilter = useMemoryStore((state) => state.scopeFilter);
  const projectFilter = useMemoryStore((state) => state.projectFilter);
  const query = useMemoryStore((state) => state.query);
  const load = useMemoryStore((state) => state.load);
  const setScopeFilter = useMemoryStore((state) => state.setScopeFilter);
  const setProjectFilter = useMemoryStore((state) => state.setProjectFilter);
  const setQuery = useMemoryStore((state) => state.setQuery);

  const projects = useWorkStore((state) => state.projects);
  const loadWork = useWorkStore((state) => state.load);

  const [editing, setEditing] = useState<MemoryDetail | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<MemorySummary | null>(null);
  const [failure, setFailure] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    void load();
    void loadWork();
  }, [load, loadWork]);

  useEffect(() => {
    const editId = searchParams.get("edit");

    if (editId === null || editId === "") {
      return;
    }

    let cancelled = false;

    void fetchMemory(editId).then(
      (detail) => {
        if (!cancelled) {
          setEditing(detail);
          setSearchParams({}, { replace: true });
        }
      },
      (cause: unknown) => {
        if (!cancelled) {
          setFailure(
            cause instanceof Error ? cause.message : "Unable to open learning.",
          );
          setSearchParams({}, { replace: true });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  async function editMemory(memory: MemorySummary) {
    setFailure("");

    try {
      setEditing(await fetchMemory(memory.id));
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Unable to open learning.",
      );
    }
  }

  async function remove() {
    if (!deleting) {
      return;
    }

    try {
      await deleteMemory(deleting.id);
      setDeleting(null);
      await load();
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Unable to delete learning.",
      );
      setDeleting(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full space-y-6 px-6 py-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">Learnings</h1>

          <p className="text-sm font-light text-zinc-400">
            Teach veykor preferences, rules, and procedures that persist across
            chats.
          </p>
        </div>

        <Divider />

        <MemoryFilters
          onProjectChange={setProjectFilter}
          onQueryChange={setQuery}
          onScopeChange={setScopeFilter}
          projectFilter={projectFilter}
          projects={projects}
          query={query}
          scopeFilter={scopeFilter}
        />

        {(error || failure) && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-rose-400">
              {error || failure}
            </p>

            <button
              className="text-sm font-semibold text-zinc-300 hover:text-zinc-100"
              onClick={() => {
                setFailure("");
                void load();
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        )}

        {!loaded || loading ? (
          <div className="grid place-items-center gap-2 py-16 text-zinc-500">
            <LoadingSpinner />

            <p className="text-sm font-light" role="status">
              Loading learnings...
            </p>
          </div>
        ) : memories.length === 0 && query === "" && scopeFilter === "" ? (
          <div className="py-16">
            <EmptyState
              actionLabel="Add learning"
              description="Teach veykor preferences, rules, and procedures that persist across chats."
              framedIcon={false}
              iconSize={40}
              onAction={() => setEditing(null)}
              title="No learnings yet"
            />
          </div>
        ) : (
          <MemoryList
            memories={memories}
            onAdd={() => setEditing(null)}
            onDelete={setDeleting}
            onEdit={(memory) => void editMemory(memory)}
          />
        )}

        {editing !== undefined && (
          <MemoryDialog
            memory={editing}
            onClose={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              void load();
            }}
            projects={projects}
          />
        )}

        {deleting && (
          <AlertDialog
            title="Delete learning"
            description="Remove this learning? It will no longer apply to new turns."
            confirmLabel="Delete"
            onClose={() => setDeleting(null)}
            onConfirm={() => void remove()}
          />
        )}
      </div>
    </div>
  );
}

export default MemoryPage;
