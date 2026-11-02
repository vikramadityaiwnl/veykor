import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "veykor-echo", version: "0.0.0" });

server.tool(
  "echo",
  "Echoes the input text back.",
  { text: z.string() },
  async ({ text }) => ({ content: [{ type: "text", text }] }),
);

const transport = new StdioServerTransport();

await server.connect(transport);
