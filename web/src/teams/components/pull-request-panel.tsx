import { useEffect, useState } from "react";
import type { PullRequestDetail } from "@veykor/shared";
import AlertDialog from "../../components/alert-dialog/alert-dialog.tsx";
import EmptyState from "../../components/empty-state/empty-state.tsx";
import LoadingSpinner from "../../components/loading-spinner/loading-spinner.tsx";
import { semanticColors, themeColors } from "../../theme/theme-colors.ts";
import {
  closePullRequest,
  fetchPullRequest,
  mergePullRequest,
} from "../../chat/chat-client.ts";

interface Props {
  chatId: string;
  number: number;
}

function stateLabel(detail: PullRequestDetail): string {
  if (detail.merged) {
    return "Merged";
  }

  if (detail.state === "CLOSED") {
    return "Closed";
  }

  return detail.draft ? "Draft" : "Open";
}

function PullRequestPanel(props: Props) {
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acting, setActing] = useState(false);
  const [confirm, setConfirm] = useState<"merge" | "close" | null>(null);

  const [refreshSeq, setRefreshSeq] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchDetail() {
      try {
        const data = await fetchPullRequest(props.chatId, props.number);

        if (!cancelled) {
          setDetail(data);
          setError("");
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load this pull request.",
          );
          setLoading(false);
        }
      }
    }

    void fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [props.chatId, props.number, refreshSeq]);

  function handleRefresh() {
    setLoading(true);
    setRefreshSeq((seq) => seq + 1);
  }

  async function handleConfirmAction() {
    if (!confirm) {
      return;
    }

    const action = confirm;

    setConfirm(null);
    setActing(true);
    setNotice("");
    setError("");

    try {
      const result =
        action === "merge"
          ? await mergePullRequest(props.chatId, props.number)
          : await closePullRequest(props.chatId, props.number);

      setNotice(result.message);
      setDetail(await fetchPullRequest(props.chatId, props.number));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That action failed.");
    } finally {
      setActing(false);
    }
  }

  if (loading && !detail) {
    return (
      <div className="grid h-full place-items-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          title="Pull request unavailable"
          description={error === "" ? undefined : error}
        />
      </div>
    );
  }

  const closed = detail.merged || detail.state === "CLOSED";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                detail.merged
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {stateLabel(detail)}
            </span>

            <span className={`text-xs font-light ${themeColors.muted}`}>
              #{detail.number} by{" "}
              {detail.author === "" ? "unknown" : detail.author}
            </span>
          </div>

          <h2 className="text-base font-semibold text-zinc-50">
            {detail.title === "" ? "Untitled pull request" : detail.title}
          </h2>

          <p className={`text-xs font-light ${themeColors.muted}`}>
            {detail.headRef} into {detail.baseRef}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-light">
          <span className={semanticColors.success.text}>
            +{detail.additions}
          </span>

          <span className={semanticColors.delete.text}>
            -{detail.deletions}
          </span>

          <span className={themeColors.muted}>
            {detail.changedFiles} files · {detail.commits} commits
          </span>
        </div>

        {detail.body !== "" && (
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm font-light text-zinc-300">
            {detail.body}
          </p>
        )}

        {detail.reviewDecision !== "" && (
          <p className={`text-xs font-light ${themeColors.muted}`}>
            Reviews: {detail.reviewDecision}
          </p>
        )}

        {detail.checks.length > 0 && (
          <div className="space-y-1.5">
            <h3 className={`text-xs font-semibold ${themeColors.muted}`}>
              Checks
            </h3>

            {detail.checks.map((check, index) => (
              <div
                key={`${check.name}-${index}`}
                className="flex items-center justify-between gap-2 text-xs font-light text-zinc-300"
              >
                <span className="min-w-0 flex-1 truncate">
                  {check.name === "" ? "Check" : check.name}
                </span>

                <span
                  className={
                    check.conclusion === "SUCCESS"
                      ? semanticColors.success.text
                      : check.conclusion === "FAILURE"
                        ? semanticColors.delete.text
                        : themeColors.muted
                  }
                >
                  {check.conclusion === ""
                    ? check.status === ""
                      ? "Pending"
                      : check.status
                    : check.conclusion}
                </span>
              </div>
            ))}
          </div>
        )}

        {detail.reviews.length > 0 && (
          <div className="space-y-1.5">
            <h3 className={`text-xs font-semibold ${themeColors.muted}`}>
              Reviews
            </h3>

            {detail.reviews.map((review, index) => (
              <div
                key={`${review.author}-${index}`}
                className="flex items-center justify-between gap-2 text-xs font-light text-zinc-300"
              >
                <span className="min-w-0 flex-1 truncate">
                  {review.author === "" ? "Reviewer" : review.author}
                </span>

                <span className={themeColors.muted}>{review.state}</span>
              </div>
            ))}
          </div>
        )}

        {notice !== "" && (
          <p
            role="status"
            className={`text-xs font-light ${semanticColors.success.text}`}
          >
            {notice}
          </p>
        )}

        {error !== "" && (
          <p
            role="alert"
            className={`text-xs font-light ${semanticColors.delete.text}`}
          >
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-zinc-800 p-3">
        <button
          className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-default disabled:opacity-40 ${semanticColors.success.button}`}
          disabled={closed || acting || loading}
          onClick={() => setConfirm("merge")}
          type="button"
        >
          Merge
        </button>

        <button
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-default disabled:opacity-40"
          disabled={closed || acting || loading}
          onClick={() => setConfirm("close")}
          type="button"
        >
          Close
        </button>

        <button
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-default disabled:opacity-40"
          disabled={acting || loading}
          onClick={handleRefresh}
          type="button"
        >
          Refresh
        </button>

        {detail.url !== "" && (
          <a
            className={`ml-auto text-xs font-light underline-offset-2 hover:underline ${themeColors.muted}`}
            href={detail.url}
            rel="noreferrer"
            target="_blank"
          >
            Open in GitHub
          </a>
        )}
      </div>

      {confirm && (
        <AlertDialog
          confirmLabel={confirm === "merge" ? "Merge" : "Close"}
          danger={confirm === "close"}
          description={
            confirm === "merge"
              ? `Merge pull request #${detail.number} into ${detail.baseRef}?`
              : `Close pull request #${detail.number} without merging?`
          }
          onClose={() => setConfirm(null)}
          onConfirm={handleConfirmAction}
          title={
            confirm === "merge" ? "Merge pull request" : "Close pull request"
          }
        />
      )}
    </div>
  );
}

export default PullRequestPanel;
