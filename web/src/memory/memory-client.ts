import {
  memoryPaths,
  memoryValidationError,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type {
  CreateMemoryRequest,
  MemoryDetail,
  MemoryListResponse,
  MemoryScope,
  UpdateMemoryRequest,
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

export async function fetchMemories(filters: {
  scope?: MemoryScope;
  projectId?: string;
  query?: string;
}): Promise<MemoryListResponse> {
  const params = new URLSearchParams();

  if (filters.scope !== undefined) {
    params.set("scope", filters.scope);
  }

  if (filters.projectId !== undefined && filters.projectId !== "") {
    params.set("projectId", filters.projectId);
  }

  if (filters.query !== undefined && filters.query.trim() !== "") {
    params.set("query", filters.query.trim());
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";

  return send<MemoryListResponse>(`${memoryPaths.memories}${suffix}`, "GET");
}

export async function fetchMemory(id: string): Promise<MemoryDetail> {
  return send<MemoryDetail>(memoryPaths.memory(id), "GET");
}

export async function createMemory(
  input: CreateMemoryRequest,
): Promise<MemoryDetail> {
  const validationError = memoryValidationError(input, { partial: false });

  if (validationError !== "") {
    throw new Error(validationError);
  }

  return send<MemoryDetail>(memoryPaths.memories, "POST", input);
}

export async function updateMemory(
  id: string,
  input: UpdateMemoryRequest,
): Promise<MemoryDetail> {
  const validationError = memoryValidationError(input, { partial: true });

  if (validationError !== "") {
    throw new Error(validationError);
  }

  return send<MemoryDetail>(memoryPaths.memory(id), "PUT", input);
}

export async function deleteMemory(id: string): Promise<void> {
  await send<{ deleted: boolean }>(memoryPaths.memory(id), "DELETE");
}

export async function undoMemory(
  id: string,
  input: {
    expectedUpdatedAt?: string;
    previousInstruction?: string;
    previousScope?: MemoryScope;
    previousProjectId?: string;
  },
): Promise<MemoryDetail | { deleted: boolean }> {
  return send<MemoryDetail | { deleted: boolean }>(
    memoryPaths.undo(id),
    "POST",
    input,
  );
}
