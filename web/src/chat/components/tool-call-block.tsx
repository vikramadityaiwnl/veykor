import { useState } from "react";
import { ChevronDownIcon, WrenchIcon } from "@heroicons/react/24/outline";
import { useWorkStore } from "../../work/work-store.ts";
import { useTeamStore } from "../../teams/team-store.ts";
import type { ChatHistoryItem } from "@veykor/shared";

interface Props {
  item: ChatHistoryItem;
}

function ToolCallBlock(props: Props) {
  const [open, setOpen] = useState(false);
  const members = useTeamStore((state) => state.snapshot.members);
  const projectId = useWorkStore((state) => state.projectId);
  const member =
    projectId !== "" && props.item.tool.includes("team_delegate")
      ? members.find(
          (entry) =>
            !entry.isMain && props.item.visibleOutput.includes(entry.id),
        )
      : undefined;

  function handleToggle() {
    setOpen((current) => !current);
  }

  let name = "Tool call";

  if (props.item.displayLabel !== "") {
    name = props.item.displayLabel;
  } else if (props.item.tool !== "") {
    name = props.item.tool;
  }

  let dotClassName = "size-1.5 shrink-0 rounded-full bg-zinc-600";

  if (props.item.status === "inProgress") {
    dotClassName =
      "size-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse motion-reduce:animate-none";
  } else if (props.item.status === "completed") {
    dotClassName = "size-1.5 shrink-0 rounded-full bg-emerald-400";
  }

  const buttonClassName = open
    ? "flex w-full items-center gap-2.5 rounded-t-xl border border-b-0 border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-left"
    : "flex w-full items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-left";

  const chevronClassName = open
    ? "size-4 shrink-0 rotate-180 text-zinc-500 transition-transform duration-300 ease-in-out motion-reduce:transition-none"
    : "size-4 shrink-0 text-zinc-500 transition-transform duration-300 ease-in-out motion-reduce:transition-none";

  return (
    <div className="w-full min-w-0">
      {member && (
        <button
          type="button"
          className="mb-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs font-light text-zinc-300 hover:bg-zinc-900"
          onClick={() => useTeamStore.getState().select(member.id)}
        >
          Open {member.name}
        </button>
      )}
      <button
        aria-expanded={open}
        className={buttonClassName}
        onClick={handleToggle}
        type="button"
      >
        <span aria-hidden="true" className={dotClassName} />

        <WrenchIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-zinc-500"
        />

        <span className="flex-1 truncate text-[13px] font-light text-zinc-300">
          {name}
        </span>

        <ChevronDownIcon aria-hidden="true" className={chevronClassName} />
      </button>

      <div
        className={
          open
            ? "grid grid-rows-[1fr] opacity-100 transition-all duration-300 ease-in-out motion-reduce:transition-none"
            : "grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-in-out motion-reduce:transition-none"
        }
      >
        <div className="overflow-hidden">
          <div className="space-y-2 rounded-b-xl border border-t-0 border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
            {props.item.args !== "" && (
              <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-950 p-2 font-mono text-xs font-light whitespace-pre-wrap break-words text-zinc-500">
                {props.item.args}
              </pre>
            )}

            {props.item.visibleOutput !== "" && (
              <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-950 p-2 font-mono text-xs font-light whitespace-pre-wrap break-words text-zinc-400">
                {props.item.visibleOutput}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ToolCallBlock;
