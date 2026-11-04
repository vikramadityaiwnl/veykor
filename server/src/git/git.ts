import { execFileSync } from "node:child_process";
import type {
  GitBranches,
  GitDiff,
  PullRequestCheck,
  PullRequestDetail,
  PullRequestReview,
} from "@veykor/shared";

export class GitError extends Error {}

export class GitHubError extends Error {}

const maxBranchLength = 250;

const gitTimeoutMs = 5000;

const ghTimeoutMs = 20000;

const ghMergeTimeoutMs = 30000;

function nowIso(): string {
  return new Date().toISOString();
}

function commandMessage(cause: unknown, missing: string): string {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "stderr" in cause &&
    cause.stderr !== undefined
  ) {
    const raw = String(cause.stderr).trim();

    if (raw !== "") {
      return raw.slice(0, 500);
    }
  }

  if (cause instanceof Error) {
    if (
      "code" in cause &&
      (cause as { code?: unknown }).code === "ENOENT" &&
      cause.message.includes("spawn")
    ) {
      return missing;
    }

    if (cause.message.trim() !== "") {
      return cause.message.trim().slice(0, 500);
    }
  }

  return "The command failed.";
}

function runGit(folder: string, args: Array<string>): string {
  try {
    return execFileSync("git", ["-C", folder, ...args], {
      encoding: "utf8",
      timeout: gitTimeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (cause) {
    throw new GitError(commandMessage(cause, "Git is not installed."));
  }
}

function runGh(
  args: Array<string>,
  timeoutMs: number,
  folder?: string,
): string {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      timeout: timeoutMs,
      cwd: folder,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (cause) {
    throw new GitHubError(
      commandMessage(cause, "gh is not installed on the server."),
    );
  }
}

export function cleanBranchName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxBranchLength);
}

export function parsePrUrl(
  value: string,
): { repo: string; number: number } | null {
  const match = value.match(
    /github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/pull\/(\d+)/i,
  );

  if (!match || match[1] === undefined || match[2] === undefined) {
    return null;
  }

  const number = Number.parseInt(match[3] ?? "", 10);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return { repo: `${match[1]}/${match[2]}`, number };
}

export function parseNumstat(output: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const line of output.split("\n")) {
    const parts = line.split("\t");

    if (parts.length < 3) {
      continue;
    }

    const added = Number.parseInt(parts[0] ?? "", 10);
    const deleted = Number.parseInt(parts[1] ?? "", 10);

    if (Number.isInteger(added) && added > 0) {
      additions += added;
    }

    if (Number.isInteger(deleted) && deleted > 0) {
      deletions += deleted;
    }
  }

  return { additions, deletions };
}

export function gitHasRepo(folder: string): boolean {
  try {
    runGit(folder, ["rev-parse", "--git-dir"]);

    return true;
  } catch {
    return false;
  }
}

export function gitCurrentBranch(folder: string): string {
  try {
    return runGit(folder, ["branch", "--show-current"]) || "Detached HEAD";
  } catch {
    return "No branch";
  }
}

export function gitBranches(folder: string): GitBranches {
  const current = runGit(folder, ["branch", "--show-current"]);

  const names = runGit(folder, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
  ])
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name !== "");

  return {
    current,
    branches: names.map((name) => ({ name, current: name === current })),
  };
}

export function gitCheckout(
  folder: string,
  name: string,
  create: boolean,
): string {
  const branch = cleanBranchName(name);

  if (branch === "") {
    throw new GitError("Enter a branch name.");
  }

  runGit(folder, ["check-ref-format", "--branch", branch]);

  if (create) {
    runGit(folder, ["checkout", "-q", "-b", branch]);
  } else {
    runGit(folder, ["checkout", "-q", branch]);
  }

  return gitCurrentBranch(folder);
}

export function gitDiff(folder: string): GitDiff {
  if (!gitHasRepo(folder)) {
    return { hasGit: false, additions: 0, deletions: 0 };
  }

  try {
    const counts = parseNumstat(runGit(folder, ["diff", "--numstat", "HEAD"]));

    return { hasGit: true, ...counts };
  } catch {
    return { hasGit: true, additions: 0, deletions: 0 };
  }
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  return typeof value === "string" ? value : "";
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];

  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function readLogin(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const login = (value as Record<string, unknown>).login;

    return typeof login === "string" ? login : "";
  }

  return "";
}

function readReviews(value: unknown): Array<PullRequestReview> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 100)
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    )
    .map((entry) => ({
      author: readLogin(entry.author),
      state: readString(entry, "state"),
    }));
}

function readChecks(value: unknown): Array<PullRequestCheck> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 100)
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    )
    .map((entry) => ({
      name: readString(entry, "name") || readString(entry, "context"),
      status: readString(entry, "status"),
      conclusion: readString(entry, "conclusion"),
    }));
}

const prViewFields = [
  "number",
  "title",
  "body",
  "state",
  "author",
  "url",
  "headRefName",
  "baseRefName",
  "additions",
  "deletions",
  "changedFiles",
  "commits",
  "mergeable",
  "mergeStateStatus",
  "reviewDecision",
  "isDraft",
  "createdAt",
  "updatedAt",
  "mergedAt",
  "reviews",
  "statusCheckRollup",
].join(",");

export function toPullRequestDetail(data: unknown): PullRequestDetail {
  const record =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};

  const state = readString(record, "state");

  return {
    number: readNumber(record, "number"),
    title: readString(record, "title"),
    body: readString(record, "body"),
    state,
    merged: state === "MERGED",
    draft: record.isDraft === true,
    author: readLogin(record.author),
    url: readString(record, "url"),
    headRef: readString(record, "headRefName"),
    baseRef: readString(record, "baseRefName"),
    additions: readNumber(record, "additions"),
    deletions: readNumber(record, "deletions"),
    changedFiles: readNumber(record, "changedFiles"),
    commits: Array.isArray(record.commits) ? record.commits.length : 0,
    mergeable: readString(record, "mergeable"),
    mergeState: readString(record, "mergeStateStatus"),
    reviewDecision: readString(record, "reviewDecision"),
    checks: readChecks(record.statusCheckRollup),
    reviews: readReviews(record.reviews),
    createdAt: readString(record, "createdAt"),
    updatedAt: readString(record, "updatedAt"),
    mergedAt: readString(record, "mergedAt"),
  };
}

export function ghPrView(repo: string, number: number): PullRequestDetail {
  const raw = runGh(
    ["pr", "view", String(number), "-R", repo, "--json", prViewFields],
    ghTimeoutMs,
  );

  try {
    return toPullRequestDetail(JSON.parse(raw) as unknown);
  } catch {
    throw new GitHubError("GitHub returned an unreadable pull request.");
  }
}

export function ghPrResolve(
  folder: string,
  number: number,
): { repo: string; number: number; url: string; merged: boolean } {
  const raw = runGh(
    ["pr", "view", String(number), "--json", "number,url,state"],
    ghTimeoutMs,
    folder,
  );

  let data: Record<string, unknown> = {};

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed === "object" && parsed !== null) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    throw new GitHubError("GitHub returned an unreadable pull request.");
  }

  const url = readString(data, "url");
  const parsed = parsePrUrl(url);

  if (parsed === null) {
    throw new GitHubError("GitHub returned an unreadable pull request.");
  }

  return {
    repo: parsed.repo,
    number: readNumber(data, "number") || number,
    url,
    merged: readString(data, "state") === "MERGED",
  };
}

export function ghPrMerge(repo: string, number: number): string {
  const raw = runGh(
    ["pr", "merge", String(number), "-R", repo, "--merge"],
    ghMergeTimeoutMs,
  );

  return raw === "" ? `Pull request #${number} was merged.` : raw;
}

export function ghPrClose(repo: string, number: number): string {
  const raw = runGh(
    ["pr", "close", String(number), "-R", repo],
    ghMergeTimeoutMs,
  );

  return raw === "" ? `Pull request #${number} was closed.` : raw;
}
