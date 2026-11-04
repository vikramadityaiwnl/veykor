import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

interface Props {
  approvalCount: number;
  queueCount: number;
  taskCount: number;
  controls?: ReactNode;
  children: ReactNode;
}

function ComposerActivityPanel(props: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const title =
    props.approvalCount > 0
      ? "Needs your approval"
      : props.queueCount > 0
        ? "Queued messages"
        : "Team tasks";
  const count = props.approvalCount || props.queueCount || props.taskCount;

  if (count === 0) {
    return null;
  }

  return (
    <div
      className="rounded-3xl rounded-b-none border border-b-0 border-zinc-700 bg-zinc-900/70"
      aria-label="Composer activity"
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        <p className="text-sm font-semibold text-zinc-200">{title}</p>
        <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-100">
          {count}
        </span>
        <div className="flex-1" />
        {props.controls}
        <button
          className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand panel" : "Collapse panel"}
          aria-expanded={!collapsed}
          type="button"
        >
          {collapsed ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronUpIcon className="size-4" />
          )}
        </button>
      </div>
      {!collapsed && (
        <div className="max-h-64 overflow-y-auto border-t border-zinc-800">
          {props.children}
        </div>
      )}
    </div>
  );
}

export default ComposerActivityPanel;
