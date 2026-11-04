import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  GitBranches,
  GitChangeFile,
  GitChangeLine,
  GitChanges,
  GitDiff,
} from "@veykor/shared";

export class GitError extends Error {}

const maxBranchLength = 250;

const gitTimeoutMs = 5000;

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

function runGit(
  folder: string,
  args: Array<string>,
  maxBuffer = 1024 * 1024,
): string {
  try {
    return execFileSync("git", ["-C", folder, ...args], {
      encoding: "utf8",
      timeout: gitTimeoutMs,
      maxBuffer,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (cause) {
    throw new GitError(commandMessage(cause, "Git is not installed."));
  }
}

export function cleanBranchName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxBranchLength);
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

  let additions = 0;
  let deletions = 0;

  try {
    const counts = parseNumstat(
      runGit(folder, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--numstat",
        "HEAD",
      ]),
    );

    additions = counts.additions;
    deletions = counts.deletions;
  } catch {
    // No commits yet: only untracked files can exist.
  }

  for (const file of untrackedChanges(folder, maxChangedFiles)) {
    additions += file.additions;
  }

  return { hasGit: true, additions, deletions };
}

const maxChangedFiles = 200;

const maxChangeLines = 400;

function changePath(header: string): string {
  const rest = header.replace(/^diff --git /, "");
  const match = rest.match(/^(?:"[^"]+"|\S+) (?:"([^"]+)"|(\S+))$/);
  const raw = match?.[1] ?? match?.[2] ?? "";

  return raw.startsWith("b/") ? raw.slice(2) : raw;
}

function hunkStarts(header: string): { oldStart: number; newStart: number } {
  const match = header.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  const oldStart = Number.parseInt(match?.[1] ?? "", 10);
  const newStart = Number.parseInt(match?.[2] ?? "", 10);

  return {
    oldStart: Number.isInteger(oldStart) && oldStart > 0 ? oldStart : 1,
    newStart: Number.isInteger(newStart) && newStart > 0 ? newStart : 1,
  };
}

export function parseUnifiedDiff(output: string): GitChanges {
  const files: Array<GitChangeFile> = [];
  let current: GitChangeFile | null = null;
  let oldLine = 1;
  let newLine = 1;

  const pushCurrent = () => {
    if (current && current.path !== "") {
      files.push(current);
    }

    current = null;
  };

  for (const line of output.split("\n")) {
    if (line.startsWith("diff --git ")) {
      pushCurrent();

      current = {
        path: changePath(line),
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        lines: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("Binary files ")) {
      current.binary = true;
      continue;
    }

    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("rename ") ||
      line.startsWith("similarity ") ||
      line.startsWith("\\ ")
    ) {
      continue;
    }

    let entry: GitChangeLine | null = null;

    if (line.startsWith("@@")) {
      const starts = hunkStarts(line);

      oldLine = starts.oldStart;
      newLine = starts.newStart;
      entry = { kind: "hunk", number: 0, text: line };
    } else if (line.startsWith("+")) {
      entry = { kind: "add", number: newLine, text: line.slice(1) };
      newLine += 1;
      current.additions += 1;
    } else if (line.startsWith("-")) {
      entry = { kind: "del", number: oldLine, text: line.slice(1) };
      oldLine += 1;
      current.deletions += 1;
    } else if (line.startsWith(" ")) {
      entry = { kind: "context", number: newLine, text: line.slice(1) };
      oldLine += 1;
      newLine += 1;
    }

    if (entry && current.lines.length < maxChangeLines) {
      current.lines.push(entry);
    } else if (entry) {
      current.truncated = true;
    }
  }

  pushCurrent();

  return { files: files.slice(0, maxChangedFiles) };
}

export function gitChanges(folder: string): GitChanges {
  if (!gitHasRepo(folder)) {
    return { files: [] };
  }

  try {
    runGit(folder, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  } catch {
    return { files: untrackedChanges(folder, maxChangedFiles) };
  }

  const tracked = parseUnifiedDiff(
    runGit(
      folder,
      ["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--no-color"],
      8 * 1024 * 1024,
    ),
  ).files;
  const rest = maxChangedFiles - tracked.length;
  const untracked = rest > 0 ? untrackedChanges(folder, rest) : [];

  return {
    files: [...tracked, ...untracked].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
  };
}

const maxUntrackedBytes = 8 * 1024 * 1024;

function listUntracked(folder: string, limit: number): Array<string> {
  let raw: string;

  try {
    raw = runGit(folder, ["status", "--porcelain=v1", "-uall", "-z"]);
  } catch {
    return [];
  }

  const paths: Array<string> = [];

  for (const entry of raw.split("\0")) {
    if (entry.startsWith("?? ") && paths.length < limit) {
      paths.push(entry.slice(3));
    }
  }

  return paths;
}

function untrackedEntry(folder: string, relPath: string): GitChangeFile | null {
  let content: string;

  try {
    const stat = lstatSync(join(folder, relPath));

    if (stat.isSymbolicLink()) {
      return {
        path: relPath,
        additions: 0,
        deletions: 0,
        binary: true,
        truncated: false,
        lines: [],
      };
    }

    if (!stat.isFile() || stat.size > maxUntrackedBytes) {
      return null;
    }

    content = readFileSync(join(folder, relPath), "utf8");
  } catch {
    return null;
  }

  if (content.slice(0, 8192).includes("\0")) {
    return {
      path: relPath,
      additions: 0,
      deletions: 0,
      binary: true,
      truncated: false,
      lines: [],
    };
  }

  const parts = content === "" ? [] : content.split("\n");
  const texts =
    content !== "" && content.endsWith("\n") ? parts.slice(0, -1) : parts;
  const lines = texts.map((text, index): GitChangeLine => ({
    kind: "add",
    number: index + 1,
    text,
  }));

  return {
    path: relPath,
    additions: lines.length,
    deletions: 0,
    binary: false,
    truncated: lines.length > maxChangeLines,
    lines: lines.slice(0, maxChangeLines),
  };
}

function untrackedChanges(folder: string, limit: number): Array<GitChangeFile> {
  const entries: Array<GitChangeFile> = [];

  for (const relPath of listUntracked(folder, limit)) {
    const entry = untrackedEntry(folder, relPath);

    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}
