import { spawn } from "node:child_process";

export function runCli(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    input?: string;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
    onLine?: (line: string) => void;
    timeout?: number;
  } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let output = "";
    let pending = "";
    let failure = "";

    function stop() {
      try {
        if (process.platform !== "win32" && child.pid) {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {}
    }

    const timer = setTimeout(() => {
      failure = "Provider timed out. Please retry.";
      stop();
    }, options.timeout ?? 120_000);
    const abort = () => {
      failure = "Generation stopped";
      stop();
    };

    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      pending += text;

      if (output.length > 4_000_000) {
        failure = "Provider output exceeded the response limit";
        stop();
        return;
      }

      const lines = pending.split("\n");
      pending = lines.pop() ?? "";

      for (const line of lines) {
        options.onLine?.(line);
      }
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");

    function cleanup() {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }

    child.on("error", () => {
      cleanup();
      reject(
        new Error(
          `Unable to start ${command}. Check its installation and sign-in in Settings.`,
        ),
      );
    });
    child.on("close", (code) => {
      cleanup();

      if (pending) {
        options.onLine?.(pending);
      }

      if (failure || code !== 0) {
        reject(
          new Error(
            failure ||
              `${command} failed. Check its sign-in and selected model.`,
          ),
        );
      } else {
        resolve(output);
      }
    });

    if (options.signal?.aborted) {
      abort();
    }
  });
}
