import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  cleanBranchName,
  gitBranches,
  gitChanges,
  gitDiff,
  parseNumstat,
  parseUnifiedDiff,
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

test("unified diff parses files and lines", () => {
  const changes = parseUnifiedDiff(
    [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1111111..2222222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,3 +1,3 @@",
      " one",
      "-two",
      "+three",
      " four",
      "diff --git a/logo.png b/logo.png",
      "new file mode 100644",
      "index 0000000..3333333",
      "Binary files /dev/null and b/logo.png differ",
      "",
    ].join("\n"),
  );

  assert.equal(changes.files.length, 2);
  assert.deepEqual(changes.files[0], {
    path: "src/a.ts",
    additions: 1,
    deletions: 1,
    binary: false,
    truncated: false,
    lines: [
      { kind: "hunk", number: 0, text: "@@ -1,3 +1,3 @@" },
      { kind: "context", number: 1, text: "one" },
      { kind: "del", number: 2, text: "two" },
      { kind: "add", number: 2, text: "three" },
      { kind: "context", number: 3, text: "four" },
    ],
  });
  assert.deepEqual(changes.files[1], {
    path: "logo.png",
    additions: 0,
    deletions: 0,
    binary: true,
    truncated: false,
    lines: [],
  });
  assert.deepEqual(parseUnifiedDiff(""), { files: [] });
});

test("unified diff numbers each hunk separately", () => {
  const changes = parseUnifiedDiff(
    [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "@@ -10 +10 @@",
      " same",
      "",
    ].join("\n"),
  );

  assert.deepEqual(
    changes.files[0].lines.map((line) => [line.kind, line.number]),
    [
      ["hunk", 0],
      ["del", 1],
      ["add", 1],
      ["hunk", 0],
      ["context", 10],
    ],
  );
});

test(
  "working tree changes list edited files",
  { skip: !gitAvailable() },
  () => {
    const dir = initRepo();

    try {
      assert.deepEqual(gitChanges(dir), { files: [] });

      writeFileSync(join(dir, "a.txt"), "one\nthree\n");

      const changes = gitChanges(dir);

      assert.equal(changes.files.length, 1);
      assert.equal(changes.files[0].path, "a.txt");
      assert.equal(changes.files[0].additions, 1);
      assert.equal(changes.files[0].deletions, 1);
      assert.equal(changes.files[0].binary, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "working tree changes include untracked files",
  { skip: !gitAvailable() },
  () => {
    const dir = initRepo();

    try {
      writeFileSync(join(dir, "new.txt"), "a\nb\n");

      const changes = gitChanges(dir);

      assert.equal(changes.files.length, 1);
      assert.deepEqual(changes.files[0], {
        path: "new.txt",
        additions: 2,
        deletions: 0,
        binary: false,
        truncated: false,
        lines: [
          { kind: "add", number: 1, text: "a" },
          { kind: "add", number: 2, text: "b" },
        ],
      });
      assert.deepEqual(gitDiff(dir), {
        hasGit: true,
        additions: 2,
        deletions: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "working tree changes work before the first commit",
  { skip: !gitAvailable() },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "veykor-git-"));

    try {
      execFileSync("git", ["-C", dir, "init", "-b", "main"], {
        stdio: "ignore",
      });
      writeFileSync(join(dir, "new.txt"), "a\n");

      const changes = gitChanges(dir);

      assert.equal(changes.files.length, 1);
      assert.equal(changes.files[0].path, "new.txt");
      assert.deepEqual(gitDiff(dir), {
        hasGit: true,
        additions: 1,
        deletions: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("untracked binaries are flagged", { skip: !gitAvailable() }, () => {
  const dir = initRepo();

  try {
    writeFileSync(join(dir, "blob.bin"), Buffer.from([0, 1, 2, 3]));

    const changes = gitChanges(dir);
    const blob = changes.files.find((file) => file.path === "blob.bin");

    assert.deepEqual(blob, {
      path: "blob.bin",
      additions: 0,
      deletions: 0,
      binary: true,
      truncated: false,
      lines: [],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "untracked symlinks are listed without reading their targets",
  { skip: !gitAvailable() },
  () => {
    const dir = initRepo();
    const outside = join(dir, "..", `veykor-outside-${Date.now()}.txt`);

    try {
      writeFileSync(outside, "private outside content\n");
      symlinkSync(outside, join(dir, "outside-link.txt"));

      assert.deepEqual(gitChanges(dir).files, [
        {
          path: "outside-link.txt",
          additions: 0,
          deletions: 0,
          binary: true,
          truncated: false,
          lines: [],
        },
      ]);
    } finally {
      unlinkSync(outside);
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
