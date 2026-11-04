import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  cleanBranchName,
  gitBranches,
  gitDiff,
  parseNumstat,
  parsePrUrl,
  toPullRequestDetail,
} from "../../src/git/git.ts";

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });

    return true;
  } catch {
    return false;
  }
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "veykor-git-"));
  const run = (args: Array<string>) =>
    execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

  run(["init", "-b", "main"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  writeFileSync(join(dir, "a.txt"), "one\ntwo\n");
  run(["add", "a.txt"]);
  run(["commit", "--quiet", "-m", "init"]);

  return dir;
}

test("pull request urls resolve to repo and number", () => {
  assert.deepEqual(parsePrUrl("https://github.com/octocat/hello/pull/12"), {
    repo: "octocat/hello",
    number: 12,
  });
  assert.deepEqual(
    parsePrUrl("https://github.com/octocat/hello/pull/12/files?x=1"),
    { repo: "octocat/hello", number: 12 },
  );
  assert.equal(parsePrUrl("https://github.com/octocat/hello"), null);
  assert.equal(parsePrUrl("not a url"), null);
  assert.equal(parsePrUrl("https://github.com/octocat/hello/pull/0"), null);
});

test("branch names are trimmed and bounded", () => {
  assert.equal(cleanBranchName("  feature/x "), "feature/x");
  assert.equal(cleanBranchName(""), "");
  assert.equal(cleanBranchName(undefined), "");
  assert.equal(cleanBranchName("a".repeat(300)).length, 250);
});

test("numstat output sums additions and deletions", () => {
  assert.deepEqual(
    parseNumstat("10\t4\tweb/a.ts\n3\t0\tweb/b.ts\n-\t-\tlogo.png\n"),
    { additions: 13, deletions: 4 },
  );
  assert.deepEqual(parseNumstat(""), { additions: 0, deletions: 0 });
});

test("pull request detail fills every field", () => {
  const detail = toPullRequestDetail({
    number: 12,
    title: "Fix",
    state: "MERGED",
    author: { login: "octocat" },
    commits: [{}, {}],
    reviews: [{ author: { login: "reviewer" }, state: "APPROVED" }],
    statusCheckRollup: [
      { name: "build", status: "COMPLETED", conclusion: "SUCCESS" },
    ],
  });

  assert.equal(detail.number, 12);
  assert.equal(detail.title, "Fix");
  assert.equal(detail.merged, true);
  assert.equal(detail.draft, false);
  assert.equal(detail.author, "octocat");
  assert.equal(detail.commits, 2);
  assert.equal(detail.body, "");
  assert.deepEqual(detail.reviews, [{ author: "reviewer", state: "APPROVED" }]);
  assert.deepEqual(detail.checks, [
    { name: "build", status: "COMPLETED", conclusion: "SUCCESS" },
  ]);
});

test("branch list marks the current branch", { skip: !gitAvailable() }, () => {
  const dir = initRepo();

  try {
    execFileSync("git", ["-C", dir, "branch", "test"], {
      stdio: "ignore",
    });

    assert.deepEqual(gitBranches(dir), {
      current: "main",
      branches: [
        { name: "main", current: true },
        { name: "test", current: false },
      ],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "working tree diff counts staged and unstaged changes",
  { skip: !gitAvailable() },
  () => {
    const dir = initRepo();

    try {
      writeFileSync(join(dir, "a.txt"), "one\nthree\n");
      writeFileSync(join(dir, "b.txt"), "new\n");
      execFileSync("git", ["-C", dir, "add", "b.txt"], { stdio: "ignore" });

      assert.deepEqual(gitDiff(dir), {
        hasGit: true,
        additions: 2,
        deletions: 1,
      });
      assert.deepEqual(gitDiff(join(dir, "missing")), {
        hasGit: false,
        additions: 0,
        deletions: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("pull request detail tolerates garbage", () => {
  const detail = toPullRequestDetail("garbage");

  assert.equal(detail.number, 0);
  assert.equal(detail.merged, false);
  assert.deepEqual(detail.checks, []);
  assert.deepEqual(detail.reviews, []);
});
