import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { providerEnvironment } from "./environment.js";

const runCommand = promisify(execFile);

export interface CliProbe {
  installed: boolean;
  version: string;
}

function parseVersion(output: string): string {
  const line =
    output
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry !== "") || "";
  const match = /(\d+\.\d+\.\d+[\w.-]*)/.exec(line);

  return match ? match[1] : line;
}

async function probe(command: string): Promise<CliProbe> {
  try {
    const { stdout } = await runCommand(command, ["--version"], {
      timeout: 10_000,
      env: providerEnvironment(),
    });

    return { installed: true, version: parseVersion(stdout) };
  } catch {
    return { installed: false, version: "" };
  }
}

export function detectMuseCLI(): Promise<CliProbe> {
  return probe(process.env.MUSE_BIN || "muse");
}

export function detectOpencodeCLI(): Promise<CliProbe> {
  return probe(process.env.OPENCODE_BIN || "opencode");
}
