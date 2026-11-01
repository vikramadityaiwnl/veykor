export type McpTransport = "stdio" | "http" | "sse";

export type McpServerStatus = "unknown" | "connected" | "error";

export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
  status: McpServerStatus;
  lastError: string;
  toolCount: number;
  lastChecked: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpServersResponse {
  servers: McpServer[];
}

export interface CreateMcpServerInput {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
}

export interface UpdateMcpServerInput {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
}

export interface McpTool {
  name: string;
  description: string;
}

export interface McpTestResult {
  ok: boolean;
  tools: McpTool[];
  toolCount: number;
  error: string;
}
