import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { providerEnvironment } from "../environment.js";

export interface OpenCodeConnection {
  request: (
    method: string,
    path: string,
    body?: object,
    timeout?: number,
  ) => Promise<any>;
  close: () => Promise<void>;
}

let host: Promise<OpenCodeConnection> | undefined;

async function availablePort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const address = socket.address();

  if (!address || typeof address === "string") {
    throw new Error("Cannot allocate OpenCode port");
  }

  await new Promise<void>((resolve, reject) => {
    socket.close((error) => (error ? reject(error) : resolve()));
  });

  return address.port;
}

async function start(): Promise<OpenCodeConnection> {
  const port = await availablePort();
  const password = randomBytes(32).toString("hex");
  const child = spawn(
    process.env.OPENCODE_BIN || "opencode",
    ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      env: {
        ...providerEnvironment(),
        OPENCODE_PASSWORD: password,
        OPENCODE_SERVER_PASSWORD: password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const lifetime = new AbortController();
  let stderr = "";
  let ended = false;
  let failure = "";
  let lastStartupError = "";
  let finish!: () => void;
  const exited = new Promise<void>((resolve) => {
    finish = resolve;
  });
  child.stdout.resume();
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-8192);
  });

  function failed(message: string) {
    ended = true;
    failure = message;
    host = undefined;
    lifetime.abort();
    finish();
  }

  child.once("error", (error) => {
    failed(error.message);
  });
  child.once("exit", (code) => {
    failed(`OpenCode CLI exited (${code}): ${stderr}`);
  });

  async function request(
    method: string,
    path: string,
    body?: object,
    timeout = 30_000,
  ): Promise<any> {
    if (ended) {
      throw new Error(failure || "OpenCode CLI disconnected");
    }

    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeout)]),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 2000);
      throw new Error(
        `OpenCode ${method} ${path.split("?")[0]}: ${response.status} ${text}`,
      );
    }

    return response.status === 204 ? undefined : response.json();
  }

  async function close() {
    if (!ended) {
      child.kill("SIGTERM");
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 3000);
      await exited;
      clearTimeout(timer);
    }
  }

  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline && !ended) {
    try {
      const schema = await request("GET", "/openapi.json", undefined, 1000);

      if (!schema.paths?.["/api/session/{sessionID}/prompt"]) {
        throw new Error(
          "Install an OpenCode v2 CLI with the /api/session prompt API",
        );
      }

      return { request, close };
    } catch (error) {
      lastStartupError =
        error instanceof Error ? error.message : "OpenCode startup failed";

      if (
        lastStartupError.startsWith("Install an OpenCode") ||
        /: (400|401|403|404) /.test(lastStartupError)
      ) {
        await close();
        throw error;
      }

      await delay(150);
    }
  }

  await close();
  throw new Error(
    lastStartupError ||
      failure ||
      `OpenCode CLI did not become ready: ${stderr}`,
  );
}

export function openCodeConnection(): Promise<OpenCodeConnection> {
  host ??= start().catch((error) => {
    host = undefined;
    throw error;
  });

  return host;
}

export async function closeOpenCodeConnection() {
  const current = host;
  host = undefined;

  if (current) {
    await (await current).close();
  }
}
