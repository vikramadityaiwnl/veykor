import type { ChatToolCall, ProviderCliId } from "@veykor/shared";

type Event = Record<string, any>;

function text(value: unknown, limit = 500): string {
  if (value === undefined || value === null) {
    return "";
  }
  return (typeof value === "string" ? value : JSON.stringify(value)).slice(
    0,
    limit,
  );
}

function target(input: Event): string {
  return text(
    input.filePath ||
      input.path ||
      input.command ||
      input.query ||
      input.url ||
      input,
  );
}

export function toolEvents(
  provider: ProviderCliId,
  event: Event,
  known: Map<string, ChatToolCall>,
): ChatToolCall[] {
  const updates: ChatToolCall[] = [];

  function update(
    id: unknown,
    name: unknown,
    state: unknown,
    input: unknown,
    output?: unknown,
    error?: unknown,
  ) {
    const key = text(id, 200);
    if (!key) {
      return;
    }
    const previous = known.get(key);
    const status = ["completed", "complete", "success", "succeeded"].includes(
      String(state),
    )
      ? "complete"
      : ["error", "failed", "failure", "cancelled"].includes(String(state))
        ? "error"
        : state === "pending"
          ? "pending"
          : "running";
    const tool: ChatToolCall = {
      id: key,
      name: text(name, 200) || previous?.name || "Tool",
      target:
        input === undefined
          ? previous?.target || ""
          : typeof input === "object" && input !== null
            ? target(input as Event)
            : text(input),
      status,
      result:
        output === undefined ? previous?.result || "" : text(output, 20_000),
      errorMessage: text(error, 2000),
    };
    known.set(key, tool);
    updates.push(tool);
  }

  if (provider === "opencode" && event.type === "tool_use") {
    const part = event.part || {};
    const state = part.state || {};
    update(
      part.callID || part.id,
      part.tool,
      state.status,
      state.input,
      state.output,
      state.error,
    );
  }

  if (provider === "claude") {
    for (const part of event.message?.content || []) {
      if (part.type === "tool_use") {
        update(part.id, part.name, "running", part.input);
      } else if (part.type === "tool_result") {
        update(
          part.tool_use_id,
          undefined,
          part.is_error ? "error" : "complete",
          undefined,
          part.content,
          part.is_error ? part.content : "",
        );
      }
    }
  }

  if (
    provider === "codex" &&
    ["item.started", "item.updated", "item.completed"].includes(event.type)
  ) {
    const item = event.item || {};
    if (
      [
        "command_execution",
        "file_change",
        "mcp_tool_call",
        "web_search",
      ].includes(item.type)
    ) {
      update(
        item.id,
        item.tool || item.type,
        item.status === "failed"
          ? "error"
          : event.type === "item.completed"
            ? "complete"
            : "running",
        item.command || item.arguments || item.query || item.changes,
        item.aggregated_output || item.result,
        item.error,
      );
    }
  }

  if (provider === "muse") {
    const payload = event.payload || {};
    const item = payload.item;
    if (item?.type === "toolCall") {
      update(
        item.id || item.toolCallId,
        item.toolName || item.name,
        item.status,
        item.arguments,
        item.result,
        item.error,
      );
    }
    const task = payload.event || {};
    const id = task.task_id || payload.task_id;
    if (
      task.kind === "proposed" &&
      /^(tool[.:/]|workspace[.:/]|shell[.:/]|web[.:/])/.test(
        task.task_kind || "",
      )
    ) {
      update(id, task.task_kind, "pending", task.input || "");
    } else if (
      known.has(String(id)) &&
      ["started", "completed", "failed", "cancelled"].includes(task.kind)
    ) {
      update(
        id,
        undefined,
        task.kind === "started" ? "running" : task.kind,
        undefined,
        task.result,
        task.reason,
      );
    }
  }

  return updates;
}
