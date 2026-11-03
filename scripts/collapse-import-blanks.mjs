import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function listSourceFiles() {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" });
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    {
      encoding: "utf8",
    },
  );

  return [...tracked.split("\n"), ...untracked.split("\n")].filter((path) =>
    /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path),
  );
}

function isImportStart(line) {
  return /^\s*import[\s"']/.test(line);
}

function depthDelta(line) {
  let depth = 0;
  let quote = "";

  for (const char of line) {
    if (quote !== "") {
      if (char === quote) {
        quote = "";
      }

      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{" || char === "(" || char === "[") {
      depth += 1;
    }

    if (char === "}" || char === ")" || char === "]") {
      depth -= 1;
    }
  }

  return depth;
}

function importRanges(lines) {
  const ranges = [];
  let index = 0;

  while (index < lines.length) {
    if (!isImportStart(lines[index])) {
      index += 1;
      continue;
    }

    let depth = 0;
    let end = index;

    do {
      depth += depthDelta(lines[end]);
      end += 1;
    } while (end < lines.length && depth > 0);

    ranges.push([index, end]);
    index = end;
  }

  return ranges;
}

function collapseBlanks(text) {
  const lines = text.split("\n");
  const starts = new Set();
  const ends = new Set();

  for (const [start, end] of importRanges(lines)) {
    starts.add(start);
    ends.add(end - 1);
  }

  const kept = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== "") {
      kept.push(lines[index]);
      continue;
    }

    let previous = index - 1;

    while (previous >= 0 && lines[previous].trim() === "") {
      previous -= 1;
    }

    let next = index + 1;

    while (next < lines.length && lines[next].trim() === "") {
      next += 1;
    }

    if (ends.has(previous) && starts.has(next)) {
      continue;
    }

    kept.push(lines[index]);
  }

  return kept.join("\n");
}

for (const path of listSourceFiles()) {
  let before = "";

  try {
    before = readFileSync(path, "utf8");
  } catch {
    continue;
  }

  const after = collapseBlanks(before);

  if (after !== before) {
    writeFileSync(path, after);
  }
}
