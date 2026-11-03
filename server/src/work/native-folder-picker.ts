import { execFile } from "node:child_process";
import { basename } from "node:path";
import { realpathSync } from "node:fs";
import { promisify } from "node:util";

const runFile = promisify(execFile);
let picking = false;

export async function pickNativeFolder(): Promise<{
  folder: string;
  name: string;
}> {
  if (picking) {
    throw new Error("A folder picker is already open on this computer.");
  }

  picking = true;

  try {
    const result = await runFile(
      "/usr/bin/osascript",
      [
        "-e",
        'POSIX path of (choose folder with prompt "Choose a project folder for veykor")',
      ],
      { timeout: 120000, maxBuffer: 65536 },
    );
    const folder = realpathSync(result.stdout.trim());

    return { folder, name: basename(folder) || folder };
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "stderr" in cause &&
      String(cause.stderr).includes("(-128)")
    ) {
      return { folder: "", name: "" };
    }

    throw new Error("Unable to open the native folder picker.");
  } finally {
    picking = false;
  }
}
