import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "@heroicons/react/24/solid";
import type { GitBranches } from "@veykor/shared";
import AlertDialog from "../../components/alert-dialog/alert-dialog.tsx";
import LoadingSpinner from "../../components/loading-spinner/loading-spinner.tsx";
import { themeColors } from "../../theme/theme-colors.ts";
import { useWorkStore } from "../work-store.ts";
import { workRequest } from "../work-client.ts";

interface Props {
  anchorRect: DOMRect;
  projectId: string;
  onClose: () => void;
}

const panelWidth = 256;

function BranchMenu(props: Props) {
  const onClose = props.onClose;
  const projectId = props.projectId;
  const loadProjects = useWorkStore((state) => state.load);

  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await workRequest<GitBranches>(
          `projects/${projectId}/git/branches`,
        );

        if (!cancelled) {
          setBranches(data);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Unable to list branches.",
          );
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  async function checkout(branch: string, create: boolean) {
    setBusy(true);

    try {
      await workRequest<{ branch: string }>(
        `projects/${projectId}/git/checkout`,
        "POST",
        { name: branch, create },
      );

      await loadProjects();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to switch branches.",
      );
      setBusy(false);
    }
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const branch = name.trim();

    if (branch !== "" && !busy) {
      void checkout(branch, true);
    }
  }

  const left = Math.min(
    Math.max(props.anchorRect.right - panelWidth, 8),
    window.innerWidth - panelWidth - 8,
  );
  const bottom = window.innerHeight - props.anchorRect.top + 8;

  return createPortal(
    <>
      <button
        aria-label="Close branches"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
        type="button"
      />

      <div
        className="fixed z-50 max-h-80 w-64 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
        style={{ left: Math.max(left, 8), bottom: Math.max(bottom, 8) }}
      >
        <form className="flex gap-1.5 p-1" onSubmit={handleCreate}>
          <input
            autoFocus
            className="w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            placeholder="New branch name"
            type="text"
            value={name}
          />

          <button
            className="shrink-0 cursor-pointer rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-default disabled:opacity-40"
            disabled={busy || name.trim() === ""}
            type="submit"
          >
            Create
          </button>
        </form>

        <div aria-hidden="true" className="mx-1 my-1 h-px bg-zinc-800" />

        {branches === null ? (
          <div className="grid place-items-center py-4">
            <LoadingSpinner size="sm" />
          </div>
        ) : branches.branches.length === 0 ? (
          <p className={`px-2 py-3 text-xs font-light ${themeColors.muted}`}>
            No branches yet. Your first commit creates one.
          </p>
        ) : (
          branches.branches.map((branch) => (
            <button
              key={branch.name}
              className={
                branch.current
                  ? "flex w-full cursor-default items-center gap-2 rounded-lg bg-zinc-800 px-2 py-1.5 text-left text-xs font-light text-zinc-50"
                  : "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-light text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-default disabled:opacity-40"
              }
              disabled={busy || branch.current}
              onClick={() => void checkout(branch.name, false)}
              title={
                branch.current ? "Current branch" : `Switch to ${branch.name}`
              }
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">{branch.name}</span>

              {branch.current && (
                <CheckIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-zinc-200"
                />
              )}
            </button>
          ))
        )}
      </div>

      {error !== "" && (
        <AlertDialog
          confirmLabel="OK"
          danger={false}
          description={error}
          onClose={() => setError("")}
          onConfirm={() => setError("")}
          title="Git action failed"
        />
      )}
    </>,
    document.body,
  );
}

export default BranchMenu;
