import {
  integrationPaths,
  mcpStdioFieldsError,
  mcpValidationError,
  skillPaths,
  skillValidationError,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type {
  ChatSkillsResponse,
  CreateMcpServerRequest,
  CreateSkillRequest,
  McpServerListResponse,
  McpServerSummary,
  McpTransport,
  SkillDetail,
  SkillListResponse,
  UpdateMcpServerRequest,
  UpdateSkillRequest,
} from "@veykor/shared";

async function readError(response: Response): Promise<string> {
  const fallback = "Request failed";

  try {
    const body = (await response.json()) as { error?: unknown };

    if (typeof body.error === "string" && body.error !== "") {
      return body.error;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

async function send<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as T;
}

export function createValidationError(
  input: CreateMcpServerRequest,
  transport: McpTransport,
): string {
  return (
    mcpValidationError(input, { partial: false }) ||
    mcpStdioFieldsError(
      transport,
      { command: input.command, url: input.url },
      { partial: false },
    )
  );
}

export function updateValidationError(
  input: UpdateMcpServerRequest,
  transport: McpTransport,
  command: string,
  url: string,
): string {
  return (
    mcpValidationError(input, { partial: true }) ||
    mcpStdioFieldsError(transport, { command, url }, { partial: false })
  );
}

export async function fetchMcpServers(): Promise<McpServerListResponse> {
  return send<McpServerListResponse>(integrationPaths.mcpServers, "GET");
}

export async function createMcpServer(
  input: CreateMcpServerRequest,
): Promise<McpServerSummary> {
  const validationError = createValidationError(
    input,
    input.transport ?? "stdio",
  );

  if (validationError !== "") {
    throw new Error(validationError);
  }

  return send<McpServerSummary>(integrationPaths.mcpServers, "POST", input);
}

export async function updateMcpServer(
  id: string,
  input: UpdateMcpServerRequest,
): Promise<McpServerSummary> {
  const validationError = mcpValidationError(input, { partial: true });

  if (validationError !== "") {
    throw new Error(validationError);
  }

  return send<McpServerSummary>(integrationPaths.mcpServer(id), "PUT", input);
}

export async function deleteMcpServer(id: string): Promise<void> {
  await send<{ deleted: boolean }>(integrationPaths.mcpServer(id), "DELETE");
}

export async function fetchSkills(): Promise<SkillListResponse> {
  return send<SkillListResponse>(skillPaths.skills, "GET");
}

export async function fetchSkill(id: string): Promise<SkillDetail> {
  return send<SkillDetail>(skillPaths.skill(id), "GET");
}

export async function createSkill(
  input: CreateSkillRequest,
): Promise<SkillDetail> {
  const validationError = skillValidationError(input, { partial: false });

  if (validationError !== "") {
    throw new Error(validationError);
  }

  return send<SkillDetail>(skillPaths.skills, "POST", input);
}

export async function updateSkill(
  id: string,
  input: UpdateSkillRequest,
): Promise<SkillDetail> {
  const validationError = skillValidationError(input, { partial: true });

  if (validationError !== "") {
    throw new Error(validationError);
  }

  return send<SkillDetail>(skillPaths.skill(id), "PUT", input);
}

export async function deleteSkill(id: string): Promise<void> {
  await send<{ deleted: boolean }>(skillPaths.skill(id), "DELETE");
}

export async function fetchChatSkills(
  chatId: string,
): Promise<ChatSkillsResponse> {
  return send<ChatSkillsResponse>(skillPaths.chatSkills(chatId), "GET");
}
