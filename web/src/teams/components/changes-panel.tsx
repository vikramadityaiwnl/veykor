import { useEffect, useState } from "react";
import type { GitChangeFile, GitChanges } from "@veykor/shared";
import CollapsibleSection from "../../components/collapsible-section/collapsible-section.tsx";
import EmptyState from "../../components/empty-state/empty-state.tsx";
import LoadingSpinner from "../../components/loading-spinner/loading-spinner.tsx";
import { semanticColors, themeColors } from "../../theme/theme-colors.ts";
import { useWorkStore } from "../../work/work-store.ts";
import { workRequest } from "../../work/work-client.ts";

function fileTitle(file: GitChangeFile): string {
  if (file.binary) {
    return `${file.path} · binary`;
  }

  const counts = `+${file.additions} -${file.deletions}`;

  return file.truncated
    ? `${file.path} · ${counts} · truncated`
    : `${file.path} · ${counts}`;
}

function fileTitleNode(file: GitChangeFile) {
  const slash = file.path.lastIndexOf("/");
  const dir = slash === -1 ? "" : file.path.slice(0, slash + 1);
  const base = slash === -1 ? file.path : file.path.slice(slash + 1);

  return (
    <span className="flex min-w-0 flex-1 items-baseline" title={file.path}>
      {dir !== "" && <span className="truncate text-zinc-500">{dir}</span>}

      <span className="shrink-0 text-zinc-50">{base}</span>

      <span className="ml-2 flex shrink-0 items-center gap-1.5 text-xs font-light">
        {file.binary ? (
          <span className={themeColors.muted}>binary</span>
        ) : (
          <>
            <span className={semanticColors.success.text}>
              +{file.additions}
            </span>

            <span className={semanticColors.delete.text}>
              -{file.deletions}
            </span>
          </>
        )}

        {file.truncated && <span className={themeColors.muted}>truncated</span>}
      </span>
    </span>
  );
}

function ChangesPanel() {
  const projectId = useWorkStore((state) => state.projectId);

  const [changes, setChanges] = useState<GitChanges | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (projectId === "") {
      return;
    }

    let cancelled = false;

    async function fetchChanges() {
      try {
        const data = await workRequest<GitChanges>(
          `projects/${projectId}/git/changes`,
        );

        if (!cancelled) {
          setChanges(data);
          setError("");
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Unable to read changes.",
          );
          setLoading(false);
        }
      }
    }

    void fetchChanges();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function toggle(path: string) {
    setClosed((prev) => {
      const next = new Set(prev);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }

  if (projectId === "") {
    return (
      <div className="grid h-full place-items-center p-6">
        <EmptyState title="No project open" />
      </div>
    );
  }

  if (loading && !changes) {
    return (
      <div className="grid h-full place-items-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!changes) {
    return (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          title="Changes unavailable"
          description={error === "" ? undefined : error}
        />
      </div>
    );
  }

  const additions = changes.files.reduce(
    (sum, file) => sum + file.additions,
    0,
  );
  const deletions = changes.files.reduce(
    (sum, file) => sum + file.deletions,
    0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <span className="text-xs font-light text-zinc-200">
          {changes.files.length === 1
            ? "1 file changed"
            : `${changes.files.length} files changed`}
        </span>

        <span className={`text-xs font-light ${semanticColors.success.text}`}>
          +{additions}
        </span>

        <span className={`text-xs font-light ${semanticColors.delete.text}`}>
          -{deletions}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {changes.files.length === 0 && (
          <EmptyState
            title="Working tree clean"
            description="No uncommitted changes."
          />
        )}

        {changes.files.map((file) => (
          <CollapsibleSection
            key={file.path}
            onToggle={() => toggle(file.path)}
            open={!closed.has(file.path)}
            title={fileTitle(file)}
            titleNode={fileTitleNode(file)}
          >
            {file.binary ? (
              <p className={`text-xs font-light ${themeColors.muted}`}>
                Binary file changed.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg bg-zinc-950 py-1 font-mono text-[11px] leading-5">
                {file.lines.map((line, index) => {
                  if (line.kind === "hunk") {
                    if (index === 0) {
                      return null;
                    }

                    return (
                      <div
                        key={index}
                        aria-hidden="true"
                        className="mx-2 my-1 border-t border-zinc-800"
                      />
                    );
                  }

                  return (
                    <div
                      key={index}
                      className={`flex whitespace-pre ${
                        line.kind === "add"
                          ? `bg-emerald-500/10 ${semanticColors.success.text}`
                          : line.kind === "del"
                            ? `bg-red-500/10 ${semanticColors.delete.text}`
                            : "text-zinc-500"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="w-10 shrink-0 select-none border-r border-zinc-800/70 pr-2 text-right tabular-nums text-zinc-600"
                      >
                        {line.number}
                      </span>

                      <span className="px-2">
                        {line.text === "" ? " " : line.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleSection>
        ))}

        {error !== "" && (
          <p
            role="alert"
            className={`text-xs font-light ${semanticColors.delete.text}`}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default ChangesPanel;
