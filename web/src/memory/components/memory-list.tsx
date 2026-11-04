import { PlusIcon } from "@heroicons/react/24/outline";
import type { MemorySummary } from "@veykor/shared";
import EmptyState from "../../components/empty-state/empty-state.tsx";
import MemoryCard from "./memory-card.tsx";

interface Props {
  memories: Array<MemorySummary>;
  onAdd: () => void;
  onDelete: (memory: MemorySummary) => void;
  onEdit: (memory: MemorySummary) => void;
}

function MemoryList(props: Props) {
  if (props.memories.length === 0) {
    return (
      <div className="py-16">
        <EmptyState
          actionLabel="Add memory"
          description="Teach veykor preferences, rules, and procedures that persist across chats."
          framedIcon={false}
          iconSize={40}
          onAction={props.onAdd}
          title="No memories yet"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <button
        aria-label="Add memory"
        className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-zinc-700 transition hover:bg-zinc-900"
        onClick={props.onAdd}
        type="button"
      >
        <EmptyState
          icon={
            <PlusIcon aria-hidden="true" className="size-5 text-zinc-500" />
          }
          title="Add memory"
        />
      </button>

      {props.memories.map((memory) => (
        <MemoryCard
          key={memory.id}
          memory={memory}
          onDelete={props.onDelete}
          onEdit={props.onEdit}
        />
      ))}
    </div>
  );
}

export default MemoryList;
