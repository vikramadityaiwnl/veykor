import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronUpIcon } from "@heroicons/react/24/outline";

interface Props {
  title: string;
  count: number;
  first: boolean;
  last: boolean;
  controls?: ReactNode;
  children: ReactNode;
}

function ComposerActivityPanel(props: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const rounded = props.first ? "rounded-t-3xl" : "";
  const topBorder = props.first ? "" : "border-t-0";
  const bottomBorder = props.last ? "border-b-0" : "";

  return (
    <div
      className={`${rounded} ${topBorder} ${bottomBorder} border border-zinc-700 bg-zinc-900/70`}
      aria-label={props.title}
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        <p className="text-sm font-semibold text-zinc-200">{props.title}</p>

        <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-100">
          {props.count}
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
          <ChevronUpIcon
            className={`size-4 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="max-h-64 overflow-y-auto border-t border-zinc-800 pt-3">
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComposerActivityPanel;
