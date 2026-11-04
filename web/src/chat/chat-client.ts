import {
  chatPaths,
  imagePaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type {
  ChatApprovalRequest,
  ChatDetail,
  ChatHistoryItem,
  ChatModelCatalog,
  ChatSummary,
  ChatTurnEvent,
  DecideApprovalRequest,
  GeneratedImageArtifact,
  SteerTurnRequest,
  UpdateChatSettingsRequest,
} from "@veykor/shared";

export type TurnEvent = ChatTurnEvent;

export interface TurnImageInput {
  mediaType: string;
  base64Data: string;
}

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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

async function requestJson<T>(
  url: string,
  init: RequestInit,
  parseBody: boolean,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...init,
      headers: {
        "Content-Type": "application/json",
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
        ...init.headers,
      },
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new HttpError(response.status, await readError(response));
  }

  if (!parseBody) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new HttpError(response.status, await readError(response));
  }

  return (await response.json()) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  return typeof value === "string" ? value : "";
}

function readDuration(record: Record<string, unknown>, key: string): number {
  const value = record[key];

  return typeof value === "number" && value > 0 ? value : 0;
}

function toTurnEvent(name: string, data: unknown): TurnEvent | null {
  if (isRecord(data) && typeof data.type === "string") {
    const typed = data as Partial<TurnEvent> & { type: string };

    switch (typed.type) {
      case "turn-started":
      case "item":
      case "delta":
      case "approval":
      case "approval-resolved":
      case "todos":
      case "turn-completed":
      case "error":
      case "memory-saved":
        return typed as TurnEvent;
      default:
        return null;
    }
  }

  if (!isRecord(data)) {
    if (name === "todos" && Array.isArray(data)) {
      const todos = data.filter((entry): entry is Record<string, unknown> =>
        isRecord(entry),
      );

      return { type: "todos", todos };
    }

    return null;
  }

  switch (name) {
    case "turn-started":
      return {
        type: "turn-started",
        turnId: readString(data, "turnId"),
        startedAt: readDuration(data, "startedAt"),
      };

    case "item": {
      const item = isRecord(data.item) ? data.item : data;

      return { type: "item", item: item as unknown as ChatHistoryItem };
    }

    case "delta":
      return {
        type: "delta",
        itemId: readString(data, "itemId"),
        field: readString(data, "field"),
        delta: readString(data, "delta"),
      };

    case "approval": {
      const approval = isRecord(data.approval) ? data.approval : data;

      return {
        type: "approval",
        approval: approval as unknown as ChatApprovalRequest,
      };
    }

    case "approval-resolved":
      return {
        type: "approval-resolved",
        approvalId: readString(data, "approvalId"),
      };

    case "todos": {
      const raw = Array.isArray(data.todos) ? data.todos : [];

      const todos = raw.filter((entry): entry is Record<string, unknown> =>
        isRecord(entry),
      );

      return { type: "todos", todos };
    }

    case "turn-completed":
      return {
        type: "turn-completed",
        turnId: readString(data, "turnId"),
        terminal: readString(data, "terminal"),
        error: readString(data, "error"),
        durationMs: readDuration(data, "durationMs"),
      };

    case "error":
      return { type: "error", message: readString(data, "message") };

    case "memory-saved": {
      const receipt = isRecord(data.receipt) ? data.receipt : data;

      return {
        type: "memory-saved",
        receipt: receipt as unknown as import("@veykor/shared").MemoryReceipt,
      };
    }

    default:
      return null;
  }
}

function parseEventBlock(block: string): TurnEvent | null {
  const lines = block.split("\n");

  let name = "";
  const dataLines: Array<string> = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("event:")) {
      name = trimmed.slice("event:".length).trim();
    } else if (trimmed.startsWith("data:")) {
      dataLines.push(trimmed.slice("data:".length).trim());
    }
  }

  if (name === "" || dataLines.length === 0) {
    return null;
  }

  let data: unknown;

  try {
    data = JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    return null;
  }

  return toTurnEvent(name, data);
}

export async function fetchChats(): Promise<Array<ChatSummary>> {
  return fetchJson<Array<ChatSummary>>(chatPaths.chats);
}

export async function createChat(
  sectionId: string,
  projectId = "",
  agentId = "",
  title = "",
): Promise<ChatDetail> {
  return requestJson<ChatDetail>(
    chatPaths.chats,
    {
      method: "POST",
      body: JSON.stringify({ sectionId, projectId, agentId, title }),
    },
    true,
  );
}

export async function fetchChat(id: string): Promise<ChatDetail> {
  return fetchJson<ChatDetail>(chatPaths.chat(id));
}

export async function fetchGeneratedImage(
  id: string,
): Promise<GeneratedImageArtifact> {
  return fetchJson<GeneratedImageArtifact>(imagePaths.meta(id));
}

export async function renameChat(
  id: string,
  title: string,
): Promise<ChatSummary> {
  return requestJson<ChatSummary>(
    chatPaths.chat(id),
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
    },
    true,
  );
}

export async function moveChat(
  id: string,
  sectionId: string,
): Promise<ChatSummary> {
  return requestJson<ChatSummary>(
    chatPaths.chat(id),
    {
      method: "PATCH",
      body: JSON.stringify({ sectionId }),
    },
    true,
  );
}

export async function deleteChat(id: string): Promise<void> {
  await requestJson<void>(
    chatPaths.chat(id),
    {
      method: "DELETE",
    },
    false,
  );
}

export async function fetchModels(chatId?: string): Promise<ChatModelCatalog> {
  const url =
    chatId === undefined || chatId === ""
      ? chatPaths.models
      : `${chatPaths.models}?chatId=${encodeURIComponent(chatId)}`;

  return fetchJson<ChatModelCatalog>(url);
}

export async function updateSettings(
  id: string,
  req: UpdateChatSettingsRequest,
): Promise<ChatDetail> {
  return requestJson<ChatDetail>(
    chatPaths.settings(id),
    {
      method: "PUT",
      body: JSON.stringify(req),
    },
    true,
  );
}

export async function decideApproval(
  id: string,
  req: DecideApprovalRequest,
): Promise<void> {
  await requestJson<void>(
    chatPaths.approvals(id),
    {
      method: "POST",
      body: JSON.stringify(req),
    },
    false,
  );
}

export async function queueTurn(
  id: string,
  text: string,
  images: TurnImageInput[],
): Promise<{ id: string }> {
  return requestJson<{ id: string }>(
    chatPaths.queue(id),
    { method: "POST", body: JSON.stringify({ text, images }) },
    true,
  );
}

export async function fetchQueuedTurn(
  id: string,
  jobId: string,
): Promise<{ id: string; text: string; images: TurnImageInput[] }> {
  return fetchJson<{ id: string; text: string; images: TurnImageInput[] }>(
    chatPaths.queuedTurn(id, jobId),
  );
}

export async function reorderQueuedTurns(
  id: string,
  ids: Array<string>,
): Promise<void> {
  await requestJson<void>(
    chatPaths.queueOrder(id),
    { method: "PATCH", body: JSON.stringify({ ids }) },
    false,
  );
}

export async function removeQueuedTurn(
  id: string,
  jobId: string,
): Promise<void> {
  await requestJson<void>(
    chatPaths.queuedTurn(id, jobId),
    { method: "DELETE" },
    false,
  );
}

export async function cancelTurn(id: string, turnId: string): Promise<void> {
  await requestJson<void>(
    chatPaths.cancelTurn(id, turnId),
    {
      method: "POST",
    },
    false,
  );
}

export async function steerTurn(
  id: string,
  req: SteerTurnRequest,
): Promise<void> {
  await requestJson<void>(
    chatPaths.steer(id),
    {
      method: "POST",
      body: JSON.stringify(req),
    },
    false,
  );
}

function throwIfFailed(event: TurnEvent): void {
  if (event.type === "turn-completed" && event.terminal === "failed") {
    throw new Error(
      event.error === undefined || event.error === ""
        ? "The turn failed before producing a reply."
        : event.error,
    );
  }
}

export async function streamTurn(
  id: string,
  text: string,
  images: Array<TurnImageInput>,
  onEvent: (event: TurnEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(chatPaths.turns(id), {
      signal,
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        [veykorRequestHeaderName]: veykorRequestHeaderValue,
      },
      body: JSON.stringify({ text, images }),
    });
  } catch {
    throw new Error("Unable to reach the veykor server.");
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  if (response.body === null) {
    throw new Error("The veykor server returned an empty stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");

    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseEventBlock(block);

      if (event === null) {
        continue;
      }

      if (event.type === "error") {
        throw new Error(
          event.message === "" ? "Request failed" : event.message,
        );
      }

      onEvent(event);
      throwIfFailed(event);
    }
  }

  const tail = parseEventBlock(buffer);

  if (tail !== null) {
    if (tail.type === "error") {
      throw new Error(tail.message === "" ? "Request failed" : tail.message);
    }

    onEvent(tail);
    throwIfFailed(tail);
  }
}

export function subscribeChat(
  id: string,
  onSnapshot: (detail: ChatDetail) => void,
): () => void {
  let source: EventSource;

  const connect = () => {
    source = new EventSource(chatPaths.events(id));
    source.addEventListener("snapshot", (event: MessageEvent<string>) => {
      onSnapshot(JSON.parse(event.data) as ChatDetail);
    });
  };

  const reconnect = () => {
    if (document.visibilityState === "visible") {
      source.close();
      connect();
    }
  };

  connect();
  window.addEventListener("online", reconnect);
  document.addEventListener("visibilitychange", reconnect);

  return () => {
    window.removeEventListener("online", reconnect);
    document.removeEventListener("visibilitychange", reconnect);
    source.close();
  };
}
