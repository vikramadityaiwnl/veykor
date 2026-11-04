import { useEffect, useState } from "react";
import type { GitDiff } from "@veykor/shared";
import { semanticColors } from "../../theme/theme-colors.ts";
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
    <span
      className="flex shrink-0 items-center gap-1.5 text-xs font-light"
      title="Uncommitted changes"
    >
      <span className={semanticColors.success.text}>+{diff.additions}</span>
      <span className={semanticColors.delete.text}>-{diff.deletions}</span>
    </span>
  );
}

export default GitDiffBadge;
