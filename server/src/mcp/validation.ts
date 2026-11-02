import type { CreateMcpServerInput, McpTransport, UpdateMcpServerInput } from "@veykor/shared";

const transports: McpTransport[] = ["stdio", "http", "sse"];

function isRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([key, entry]) =>
      typeof key === "string" &&
      key.length > 0 &&
      key.length <= 200 &&
      typeof entry === "string" &&
      entry.length <= 8000,
  );
}

function isArgs(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every((entry) => typeof entry === "string" && entry.length <= 2000)
  );
}

export function validMcpInput(
  input: unknown,
): input is CreateMcpServerInput & UpdateMcpServerInput {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Record<string, unknown>;

  if (
    typeof candidate.name !== "string" ||
    candidate.name.trim().length === 0 ||
    candidate.name.trim().length > 100
  ) {
    return false;
  }

  if (
    typeof candidate.transport !== "string" ||
    !transports.includes(candidate.transport as McpTransport)
  ) {
    return false;
  }

  if (
    typeof candidate.command !== "string" ||
    candidate.command.length > 500 ||
    typeof candidate.url !== "string" ||
    candidate.url.length > 2000 ||
    typeof candidate.enabled !== "boolean" ||
    !isArgs(candidate.args) ||
    !isRecord(candidate.env) ||
    !isRecord(candidate.headers)
  ) {
    return false;
  }

  if (candidate.transport === "stdio") {
    return candidate.command.trim().length > 0;
  }

  try {
    const url = new URL(candidate.url.trim());

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeMcpInput(input: CreateMcpServerInput) {
  const transport = input.transport;

  return {
    name: input.name.trim(),
    transport,
    command: transport === "stdio" ? input.command.trim() : "",
    args:
      transport === "stdio"
        ? input.args
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : [],
    env: transport === "stdio" ? input.env : {},
    url: transport === "stdio" ? "" : input.url.trim(),
    headers: transport === "stdio" ? {} : input.headers,
    enabled: input.enabled,
  };
}
