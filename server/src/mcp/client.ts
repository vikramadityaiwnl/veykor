import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpTestResult, McpTool } from "@veykor/shared";
import type { McpServerInput } from "./store.js";

const TIMEOUT_MS = 30_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }

  return "Unable to reach this MCP server.";
}

export async function probeMcpServer(
  input: McpServerInput,
  timeoutMs = TIMEOUT_MS,
): Promise<McpTestResult> {
  const client = new Client(
    { name: "veykor", version: "0.0.0" },
    { capabilities: {} },
  );

  let transport:
    StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

  try {
    if (input.transport === "stdio") {
      transport = new StdioClientTransport({
        command: input.command,
        args: input.args,
        env: { ...process.env, ...input.env } as Record<string, string>,
        stderr: "pipe",
      });
    } else if (input.transport === "sse") {
      transport = new SSEClientTransport(new URL(input.url), {
        requestInit: { headers: input.headers },
      });
    } else {
      transport = new StreamableHTTPClientTransport(new URL(input.url), {
        requestInit: { headers: input.headers },
      });
    }
  } catch (error) {
    return { ok: false, tools: [], toolCount: 0, error: errorMessage(error) };
  }

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("Connection timed out after 30 seconds.")),
      timeoutMs,
    );
  });

  try {
    await Promise.race([client.connect(transport), timeout]);

    const tools = await Promise.race([
      client.listTools().then((result) =>
        result.tools.map((tool): McpTool => ({
          name: tool.name,
          description: tool.description || "",
        })),
      ),
      timeout,
    ]);

    return { ok: true, tools, toolCount: tools.length, error: "" };
  } catch (error) {
    return { ok: false, tools: [], toolCount: 0, error: errorMessage(error) };
  } finally {
    try {
      await client.close();
    } catch {
      // The probe result is already decided; a close failure is ignorable.
    }
  }
}
