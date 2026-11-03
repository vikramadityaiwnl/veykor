import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import ApprovalCard from "./approval-card.tsx";
import { useChatStore } from "../chat-store.ts";

function todoTitle(todo: unknown): string {
  if (typeof todo === "string") {
    return todo;
  }

  if (typeof todo === "object" && todo !== null) {
    const record = todo as Record<string, unknown>;
    const title = record.title ?? record.text ?? record.label ?? "";

    return typeof title === "string" ? title : "";
  }

  return "";
}

function todoDone(todo: unknown): boolean {
  if (typeof todo === "object" && todo !== null) {
    const record = todo as Record<string, unknown>;
    const status = record.status;

    return status === "done" || status === "completed" || status === "complete";
  }

  return false;
}

function todoActive(todo: unknown): boolean {
  if (typeof todo === "object" && todo !== null) {
    const record = todo as Record<string, unknown>;
    const status = record.status;

    return (
      status === "active" ||
      status === "in-progress" ||
      status === "in_progress"
    );
  }

  return false;
}

function ComposerPanel() {
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);
  const todos = useChatStore((s) => s.todos);

  const [collapsed, setCollapsed] = useState(false);
  const [index, setIndex] = useState(0);
  const [knownIds, setKnownIds] = useState("");

  const ids = pendingApprovals.map((approval) => approval.approvalId).join(",");

  if (ids !== knownIds) {
    setKnownIds(ids);
    setIndex(0);
  }

  if (pendingApprovals.length === 0 && todos.length === 0) {
    return null;
  }

  const clamped = Math.min(index, Math.max(pendingApprovals.length - 1, 0));
  const current =
    pendingApprovals.length > 0 ? pendingApprovals[clamped] : null;

  return (
    <div className="rounded-2xl rounded-b-none border border-b-0 border-zinc-700 bg-zinc-900/70">
      <div className="flex items-center gap-2 px-4 py-2.5">
        {pendingApprovals.length > 0 ? (
          <>
            <p className="text-sm font-medium text-zinc-200">
              Needs your approval
            </p>

            <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-100">
              {pendingApprovals.length}
            </span>
          </>
        ) : (
          <p className="text-sm font-medium text-zinc-200">Tasks</p>
        )}

        <div className="flex-1" />

        {pendingApprovals.length > 1 ? (
          <div className="flex items-center gap-1">
            <button
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              onClick={() => setIndex(Math.max(clamped - 1, 0))}
              title="Previous approval"
              type="button"
            >
              <ChevronLeftIcon className="size-4" />
            </button>

            <span className="text-xs text-zinc-500">
              {clamped + 1} of {pendingApprovals.length}
            </span>

            <button
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              onClick={() =>
                setIndex(Math.min(clamped + 1, pendingApprovals.length - 1))
              }
              title="Next approval"
              type="button"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        ) : null}

        <button
          className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand panel" : "Collapse panel"}
          type="button"
        >
          {collapsed ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronUpIcon className="size-4" />
          )}
        </button>
      </div>

      {collapsed ? null : (
        <>
          {current !== null && current !== undefined ? (
            <ApprovalCard approval={current} />
          ) : null}

          {todos.length > 0 ? (
            <div className="border-t border-zinc-800 px-4 py-3">
              <p className="text-xs font-medium text-zinc-500">Tasks</p>

              <ul className="mt-2 space-y-1.5">
                {todos.slice(0, 5).map((todo, position) => {
                  return (
                    <li
                      className="flex items-center gap-2 text-xs text-zinc-300"
                      key={position}
                    >
                      <span
                        className={
                          todoDone(todo)
                            ? "size-2 shrink-0 rounded-full bg-emerald-500"
                            : todoActive(todo)
                              ? "size-2 shrink-0 rounded-full bg-sky-500"
                              : "size-2 shrink-0 rounded-full bg-zinc-600"
                        }
                      />

                      <span className="truncate">{todoTitle(todo)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default ComposerPanel;
