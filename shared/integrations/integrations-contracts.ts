export type McpTransport = "stdio" | "http";

export type McpServerMode = "required" | "optional";

export interface McpServerSummary {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  args: Array<string>;
  envKeys: Array<string>;
  url: string;
  headerNames: Array<string>;
  hasSecrets: boolean;
  enabled: boolean;
  mode: McpServerMode;
  createdAt: string;
  updatedAt: string;
}

export interface McpServerListResponse {
  servers: Array<McpServerSummary>;
  stdioAllowed: boolean;
}

export interface CreateMcpServerRequest {
  name?: string;
  transport?: McpTransport;
  enabled?: boolean;
  mode?: McpServerMode;
  command?: string;
  args?: Array<string>;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export type McpSecretPatch = Record<string, string | null>;

export interface UpdateMcpServerRequest {
  name?: string;
  transport?: McpTransport;
  enabled?: boolean;
  mode?: McpServerMode;
  command?: string;
  args?: Array<string>;
  env?: McpSecretPatch;
  url?: string;
  headers?: McpSecretPatch;
}
