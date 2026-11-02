import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { providerEnvironment } from "../environment.js";
import { MuseSession } from "./session.js";

export interface MuseEvent {
  method: string;
  params?: Record<string, unknown>;
}

export function commandId(): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6] & 15) | 112;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function spawnMuse(workspaceRoot: string) {
  const child = spawn(process.env.MUSE_BIN || "muse", ["serve"], {
    cwd: workspaceRoot,
    env: providerEnvironment(),
    stdio: "pipe",
  });
  const listeners = new Set<(event: MuseEvent) => void>();
  const pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  let nextId = 0;
  let ended = false;
  let stderr = "";
  let exited!: () => void;
  const processExited = new Promise<void>((resolve) => {
    exited = resolve;
  });
  let finish!: () => void;
  const closed = new Promise<void>((resolve) => {
    finish = resolve;
  });

  function fail(error: Error) {
    if (ended) {
      return;
    }

    ended = true;

    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }

    pending.clear();
    finish();
  }

  function write(frame: object) {
    const line = `${JSON.stringify(frame)}\n`;

    if (ended || !child.stdin.writable) {
      throw new Error("Muse CLI is disconnected");
    }

    if (Buffer.byteLength(line) > 10 * 1024 * 1024) {
      throw new Error("Muse request exceeds the 10 MiB protocol frame limit");
    }

    child.stdin.write(line);
  }

  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-8192);
  });
  child.once("error", (error) => {
    fail(error);
    exited();
  });
  child.stdin.on("error", fail);
  child.once("exit", (code) => {
    fail(new Error(`Muse CLI exited (${code}): ${stderr}`));
    exited();
  });
  const lines = createInterface({ input: child.stdout });

  lines.on("line", (line) => {
    try {
      const frame = JSON.parse(line);

      if (frame.method) {
        if (frame.id !== undefined) {
          const supported =
            frame.method === "approval/request" ||
            frame.method === "userInput/request";
          write(
            supported
              ? { jsonrpc: "2.0", id: frame.id, result: {} }
              : {
                  jsonrpc: "2.0",
                  id: frame.id,
                  error: { code: -32601, message: "Unsupported request" },
                },
          );
        }

        for (const listener of listeners) {
          listener({ method: frame.method, params: frame.params });
        }
      } else {
        const entry = pending.get(frame.id);

        if (entry) {
          pending.delete(frame.id);
          clearTimeout(entry.timer);

          if (frame.error) {
            entry.reject(
              new Error(frame.error.message || "Muse command failed"),
            );
          } else {
            entry.resolve(frame.result);
          }
        }
      }
    } catch (error) {
      fail(
        error instanceof Error ? error : new Error("Invalid Muse CLI response"),
      );
      child.kill();
    }
  });
  lines.once("close", () => {
    fail(new Error("Muse CLI output closed"));
  });

  function request(method: string, params: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            `Muse ${method} timed out; its outcome is unknown. Reopen the conversation before retrying.`,
          ),
        );
      }, 30_000);
      pending.set(id, { resolve, reject, timer });

      try {
        write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  const connection = {
    request,
    command: (method: string, params: object) =>
      request(method, { ...params, commandId: commandId() }),
    closed,
  };
  const onEvent = (handler: (event: MuseEvent) => void) => {
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  };
  const close = async () => {
    child.stdin.end();
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 3000);
    await processExited;
    clearTimeout(timer);
  };

  try {
    const initializeResult = await request("initialize", {
      clientInfo: { name: "veykor", version: "0.0.0" },
      capabilities: {
        userInputDialogs: false,
        requestedCapabilities: ["sessionMcp"],
      },
    });
    write({ jsonrpc: "2.0", method: "initialized" });

    if (
      initializeResult.sessionDurability &&
      initializeResult.sessionDurability !== "durable"
    ) {
      throw new Error("veykor requires durable Muse sessions");
    }

    const host = { initializeResult };
    const transport = { connection, onEvent, close };
    const sessions = {
      startSession: async (options: Record<string, unknown>) =>
        MuseSession.open(transport, "session/start", options),
      resumeSession: async (options: Record<string, unknown>) =>
        MuseSession.open(transport, "session/resume", options),
    };

    return {
      ...transport,
      host,
      ...sessions,
      mcpGranted:
        initializeResult.grantedCapabilities?.includes("sessionMcp") === true,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
