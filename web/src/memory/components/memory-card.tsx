import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import type { MemorySummary } from "@veykor/shared";
import Badge from "../../components/badge/badge.tsx";

interface Props {
  memory: MemorySummary;
  onDelete: (memory: MemorySummary) => void;
  onEdit: (memory: MemorySummary) => void;
}

function MemoryCard(props: Props) {
  const memory = props.memory;

  const sourceAvailable =
    memory.origin === "conversation" &&
    memory.sourceExists &&
    memory.sourceChatId !== "";

  return (
    <div
      className="cursor-pointer space-y-3 rounded-2xl border border-zinc-800 p-4 transition hover:border-zinc-700"
      onClick={() => props.onEdit(memory)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onEdit(memory);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          text={memory.scope === "project" ? "Project" : "Global"}
          tone="neutral"
        />

        {memory.scope === "project" && memory.projectName !== "" && (
          <Badge text={memory.projectName} tone="neutral" />
        )}

        {memory.scope === "project" && memory.projectName === "" && (
          <span className="text-xs font-light text-zinc-500">
            Project no longer exists
          </span>
        )}
      </div>

      <p className="text-sm font-light text-zinc-100">{memory.instruction}</p>

      <div className="flex items-center gap-4 text-xs">
        {memory.origin === "manual" && (
          <span className="font-light text-zinc-500">Created manually</span>
        )}

        {memory.origin === "conversation" && sourceAvailable && (
          <Link
            className="flex items-center gap-1 font-light text-zinc-400 transition hover:text-zinc-100"
            onClick={(event) => event.stopPropagation()}
            to={`/chat/${memory.sourceChatId}`}
          >
            Source
            <ArrowTopRightOnSquareIcon
              aria-hidden="true"
              className="size-3.5 shrink-0"
            />
          </Link>
        )}

        {memory.origin === "conversation" && !sourceAvailable && (
          <span aria-disabled="true" className="font-light text-zinc-600">
            Source unavailable
          </span>
        )}

        <button
          className="text-zinc-500 hover:text-rose-400"
          onClick={(event) => {
            event.stopPropagation();
            props.onDelete(memory);
          }}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default MemoryCard;
