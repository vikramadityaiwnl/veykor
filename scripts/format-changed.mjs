import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const files = new Set(
  [
    execFileSync("git", ["diff", "--name-only", "-z", "HEAD"], { cwd: root }),
    execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd: root,
    }),
  ].flatMap((output) => output.toString().split("\0").filter(Boolean)),
);
const supported = [];

for (const file of files) {
  if (!existsSync(new URL(file, new URL("../", import.meta.url)))) {
    continue;
  }

  const info = await prettier.getFileInfo(file, {
    ignorePath: ".prettierignore",
  });

  if (!info.ignored && info.inferredParser) {
    supported.push(file);
  }
}

if (supported.length === 0) {
  console.log("No changed files need formatting.");
} else {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/prettier/bin/prettier.cjs", import.meta.url),
      ),
      check ? "--check" : "--write",
      "--",
      ...supported,
    ],
    { cwd: root, stdio: "inherit" },
  );

  process.exitCode = result.status ?? 1;
}
