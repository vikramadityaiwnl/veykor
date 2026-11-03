import { spawn } from "node:child_process";
import type { SessionMcpServerConfig } from "../mcp/session-config.js";

export async function verifyMcpEntry(
  entry: Record<string, SessionMcpServerConfig>,
  timeoutMs = 20000,
): Promise<{ ok: boolean; error: string }> {
  const config = Object.values(entry)[0];

  if (!config || config.transport !== "stdio") {
    return { ok: false, error: "No stdio collaboration MCP entry" };
  }

  const child = spawn(config.command, config.args || [], {
    env: {
      ...process.env,
      ...(config.env || {}),
      VEYKOR_CONVERSATION_ID: "__veykor_probe__",
    },
    stdio: "pipe",
  });

  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-2000);
  });

  const result = await new Promise<{ ok: boolean; error: string }>(
    (resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ ok: false, error: "Collaboration MCP probe timed out" });
      }, timeoutMs);

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ ok: false, error: error.message });
      });

      child.on("exit", () => {
        clearTimeout(timer);

        if (stderr.includes("Collaboration tools need a project chat")) {
          resolve({ ok: true, error: "" });
        } else {
          resolve({
            ok: false,
            error: stderr || "Collaboration MCP server did not start",
          });
        }
      });
    },
  );

  return result;
}
