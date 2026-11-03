import type {
  CreateMcpServerRequest,
  McpServerListResponse,
  McpServerMode,
  McpServerSummary,
  McpTransport,
  UpdateMcpServerRequest,
} from "./integrations-contracts.js";

export const integrationPaths = {
  mcpServers: "/api/integrations/mcp",
  mcpServer: (id: string) => `/api/integrations/mcp/${id}`,
} as const;

export const mcpTransports: Array<{
  value: McpTransport;
  title: string;
  description: string;
}> = [
  {
    value: "stdio",
    title: "Standard I/O",
    description: "Launch a local executable on the host computer.",
  },
  {
    value: "http",
    title: "Streamable HTTP",
    description: "Connect to a remote endpoint over HTTP.",
  },
];

export const mcpServerModes: Array<{
  value: McpServerMode;
  title: string;
  description: string;
}> = [
  {
    value: "required",
    title: "Required",
    description: "New chats fail to start when this server is unavailable.",
  },
  {
    value: "optional",
    title: "Optional",
    description: "New chats start without this server when it is unavailable.",
  },
];

const maxNameLength = 100;

const maxCommandLength = 500;

const maxArgs = 64;

const maxArgLength = 2000;

const maxSecrets = 64;

const maxSecretNameLength = 128;

const maxSecretValueLength = 10000;

const maxUrlLength = 2000;

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const headerNamePattern = /^[A-Za-z0-9-]+$/;

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, maxNameLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function secretsError(
  value: unknown,
  kind: "environment variable" | "header",
  options: { partial: boolean },
): string {
  if (value === undefined) {
    return "";
  }

  if (!isRecord(value)) {
    return kind === "header"
      ? "Headers must be name/value pairs."
      : "Environment variables must be name/value pairs.";
  }

  const entries = Object.entries(value);

  if (entries.length > maxSecrets) {
    return kind === "header"
      ? "Use at most 64 headers."
      : "Use at most 64 environment variables.";
  }

  for (const [name, secret] of entries) {
    const nameError = mcpSecretNameError(kind, name);

    if (nameError !== "") {
      return nameError;
    }

    if (secret === null) {
      if (options.partial) {
        continue;
      }

      return kind === "header"
        ? `Header "${name}" must have a value.`
        : `Environment variable "${name}" must have a value.`;
    }

    if (typeof secret !== "string" || secret.length > maxSecretValueLength) {
      return kind === "header"
        ? `Header "${name}" must be under 10,000 characters.`
        : `Environment variable "${name}" must be under 10,000 characters.`;
    }

    if (kind === "header" && (secret.includes("\r") || secret.includes("\n"))) {
      return `Header "${name}" must be a single line.`;
    }
  }

  return "";
}

function argsError(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (!Array.isArray(value)) {
    return "Arguments must be a list.";
  }

  if (value.length > maxArgs) {
    return "Use at most 64 arguments.";
  }

  for (const entry of value) {
    if (typeof entry !== "string" || entry.includes("\0")) {
      return "Each argument must be text.";
    }

    if (entry.length > maxArgLength) {
      return "Each argument must be under 2,000 characters.";
    }
  }

  return "";
}

function urlError(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    return "Enter the endpoint URL.";
  }

  const trimmed = value.trim();

  if (trimmed.length > maxUrlLength) {
    return "That URL is too long.";
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return "Enter a valid http(s) URL.";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Enter a valid http(s) URL.";
  }

  return "";
}

export function normalizeMcpName(value: unknown): string {
  return cleanName(value);
}

export function mcpSecretNameError(
  kind: "environment variable" | "header",
  name: string,
): string {
  if (name.length === 0 || name.length > maxSecretNameLength) {
    return kind === "header"
      ? "Header names must be 1-128 characters."
      : "Environment variable names must be 1-128 characters.";
  }

  const pattern = kind === "header" ? headerNamePattern : envNamePattern;

  if (!pattern.test(name)) {
    return kind === "header"
      ? `Header name "${name}" may only use letters, numbers, and dashes.`
      : `Environment variable "${name}" must start with a letter or underscore, followed by letters, numbers, or underscores.`;
  }

  return "";
}

export function emptyMcpList(stdioAllowed: boolean): McpServerListResponse {
  return {
    servers: [],
    stdioAllowed,
  };
}

export function defaultMcpSummary(): McpServerSummary {
  return {
    id: "",
    name: "",
    transport: "stdio",
    command: "",
    args: [],
    envKeys: [],
    url: "",
    headerNames: [],
    hasSecrets: false,
    enabled: true,
    mode: "required",
    createdAt: "",
    updatedAt: "",
  };
}

export function mcpValidationError(
  input: CreateMcpServerRequest | UpdateMcpServerRequest,
  options: { partial: boolean },
): string {
  if (input.name !== undefined || !options.partial) {
    if (cleanName(input.name) === "") {
      return "Give the server a name.";
    }
  }

  if (input.transport !== undefined) {
    if (input.transport !== "stdio" && input.transport !== "http") {
      return "Choose a transport.";
    }
  } else if (!options.partial) {
    return "Choose a transport.";
  }

  if (
    input.mode !== undefined &&
    input.mode !== "required" &&
    input.mode !== "optional"
  ) {
    return "Choose required or optional startup.";
  }

  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    return "Choose whether the server is enabled.";
  }

  const transportError = argsError(input.args);

  if (transportError !== "") {
    return transportError;
  }

  const envProblem = secretsError(input.env, "environment variable", {
    partial: options.partial,
  });

  if (envProblem !== "") {
    return envProblem;
  }

  const headerProblem = secretsError(input.headers, "header", {
    partial: options.partial,
  });

  if (headerProblem !== "") {
    return headerProblem;
  }

  return "";
}

export function mcpStdioFieldsError(
  transport: McpTransport,
  input: { command?: unknown; url?: unknown },
  options: { partial: boolean },
): string {
  if (transport === "stdio") {
    if (input.command !== undefined || !options.partial) {
      const command =
        typeof input.command === "string" ? input.command.trim() : "";

      if (command === "") {
        return "Enter the executable to launch.";
      }

      if (command.length > maxCommandLength) {
        return "That executable path is too long.";
      }

      if (command.includes("\0")) {
        return "That executable path is invalid.";
      }
    }

    return "";
  }

  if (input.url !== undefined || !options.partial) {
    return urlError(input.url);
  }

  return "";
}

export function mcpStdioChangeRequiresHost(
  body: UpdateMcpServerRequest & { transport?: McpTransport },
): boolean {
  return (
    body.transport !== undefined ||
    body.command !== undefined ||
    body.args !== undefined ||
    body.env !== undefined
  );
}
