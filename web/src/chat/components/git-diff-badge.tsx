import { useEffect, useState } from "react";
import type { GitDiff } from "@veykor/shared";
import { semanticColors } from "../../theme/theme-colors.ts";
import { changesTabId } from "../../teams/changes-tab.ts";
import { useTeamStore } from "../../teams/team-store.ts";
import { useWorkStore } from "../../work/work-store.ts";
import { workRequest } from "../../work/work-client.ts";

const refreshMs = 10000;

function GitDiffBadge() {
  const projectId = useWorkStore((state) => state.projectId);
  const [state, setState] = useState<{ owner: string; diff: GitDiff | null }>({
    owner: "",
    diff: null,
  });

  useEffect(() => {
    if (projectId === "") {
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const data = await workRequest<GitDiff>(
          `projects/${projectId}/git/diff`,
        );

        if (!cancelled) {
          setState({ owner: projectId, diff: data });
        }
      } catch {
        if (!cancelled) {
          setState({ owner: projectId, diff: null });
        }
      }
    }

    void load();

    const timer = window.setInterval(() => {
      void load();
    }, refreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId]);

  const diff = state.owner === projectId ? state.diff : null;

  if (projectId === "" || !diff?.hasGit) {
    return null;
  }

  return (
    <button
      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-light transition hover:bg-zinc-800"
      onClick={() => useTeamStore.getState().select(changesTabId)}
      title="View uncommitted changes"
      type="button"
    >
      <span className={semanticColors.success.text}>+{diff.additions}</span>
      <span className={semanticColors.delete.text}>-{diff.deletions}</span>
    </button>
  );
}

export default GitDiffBadge;
