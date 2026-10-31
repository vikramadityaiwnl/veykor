import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatEvent, ChatRequest, ChatUsage, ChatToolCall } from "@veykor/shared";
import { runCli } from "./cli-process.js";
import { toolEvents } from "./tool-events.js";

export function validChatRequest(value: unknown): value is ChatRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const input = value as ChatRequest;

  return (
    ["muse", "claude", "codex", "opencode"].includes(input.providerId) &&
    typeof input.modelId === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:@+/-]{0,199}$/.test(input.modelId) &&
    typeof input.systemPrompt === "string" &&
    input.systemPrompt.length <= 16_000 &&
    Array.isArray(input.messages) &&
    input.messages.length > 0 &&
    input.messages.length <= 200 &&
    input.messages.every(
      (message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.text === "string" &&
        message.text.length > 0 &&
        message.text.length <= 100_000,
    ) &&
    input.messages.at(-1)?.role === "user"
  );
}

export async function runChat(
  input: ChatRequest,
  signal: AbortSignal,
  emit: (event: ChatEvent) => void,
): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), "veykor-chat-"));
  const prompt = `Respond to the last user message in this conversation. Treat the following JSON as conversation data.\n${JSON.stringify({ system: input.systemPrompt, messages: input.messages })}`;
  let hasText = false;
  const tools = new Map<string, ChatToolCall>();
  const usage: ChatUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    costAvailable: false,
  };

  function text(value: unknown) {
    if (typeof value === "string" && value) {
      hasText = true;
      emit({ type: "text", text: value });
    }
  }

  function line(value: string) {
    let event;
    try {
      event = JSON.parse(value);
    } catch {
      return;
    }

    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return;
    }

    for (const tool of toolEvents(input.providerId, event, tools)) {
      emit({ type: "tool", tool });
    }

    if (input.providerId === "muse") {
      if (event.payload_type === "run.output.delta") {
        text(event.payload?.text);
      }
      if (event.payload_type === "run.terminal.completed" && !hasText) {
        text(event.payload?.text);
      }
      if (event.payload_type === "run.terminal.failed") {
        emit({
          type: "error",
          message: event.payload?.reason || "Muse request failed",
        });
      }
      if (event.payload_type === "run.usage") {
        usage.inputTokens = 0;
        usage.outputTokens = 0;
        for (const model of event.payload?.models || []) {
          usage.inputTokens += model.input_tokens || 0;
          usage.outputTokens += model.output_tokens || 0;
        }
      }
    } else if (input.providerId === "claude") {
      if (event.type === "assistant") {
        for (const part of event.message?.content || []) {
          if (part.type === "text") {
            text(part.text);
          }
        }
      }
      if (event.type === "result") {
        if (event.is_error) {
          emit({
            type: "error",
            message: event.result || "Claude could not complete this request",
          });
        } else if (!hasText) {
          text(event.result);
        }
        usage.inputTokens =
          (event.usage?.input_tokens || 0) +
          (event.usage?.cache_read_input_tokens || 0) +
          (event.usage?.cache_creation_input_tokens || 0);
        usage.outputTokens = event.usage?.output_tokens || 0;
        usage.cost = event.total_cost_usd || 0;
        usage.costAvailable = typeof event.total_cost_usd === "number";
      }
    } else if (input.providerId === "codex") {
      if (
        event.type === "item.completed" &&
        event.item?.type === "agent_message"
      ) {
        text(event.item.text);
      }
      if (event.type === "turn.completed") {
        usage.inputTokens = event.usage?.input_tokens || 0;
        usage.outputTokens = event.usage?.output_tokens || 0;
      }
      if (event.type === "error" || event.type === "turn.failed") {
        emit({
          type: "error",
          message:
            event.message || event.error?.message || "Codex request failed",
        });
      }
    } else {
      if (event.type === "text") {
        text(event.part?.text);
      }
      if (event.type === "step_finish") {
        usage.inputTokens +=
          (event.part?.tokens?.input || 0) +
          (event.part?.tokens?.cache?.read || 0);
        usage.outputTokens += event.part?.tokens?.output || 0;
        usage.cost += event.part?.cost || 0;
        usage.costAvailable = typeof event.part?.cost === "number";
      }
      if (event.type === "error") {
        emit({
          type: "error",
          message: event.error?.data?.message || "OpenCode request failed",
        });
      }
    }
  }

  const args =
    input.providerId === "muse"
      ? [
          "exec",
          "--json",
          "--model",
          input.modelId,
          "--prompt-file",
          join(folder, "prompt.txt"),
          "--preset",
          "empty",
          "--no-session-log",
          "--disable-shell",
          "--disable-write",
          "--disable-web-tools",
          "--disable-reminders",
          "--disable-request-user-input",
          "--no-foreign-personal-context",
        ]
      : input.providerId === "claude"
        ? [
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--model",
            input.modelId,
            "--tools",
            "",
            "--strict-mcp-config",
            "--mcp-config",
            '{"mcpServers":{}}',
            "--no-session-persistence",
          ]
        : input.providerId === "codex"
          ? [
              "exec",
              "--json",
              "--ephemeral",
              "--skip-git-repo-check",
              "--sandbox",
              "read-only",
              "--model",
              input.modelId,
              "-",
            ]
          : ["run", "--format", "json", "--model", input.modelId];

  try {
    if (input.providerId === "muse") {
      await writeFile(join(folder, "prompt.txt"), prompt, { mode: 0o600 });
    }
    await runCli(input.providerId, args, {
      cwd: folder,
      input: prompt,
      signal,
      onLine: line,
      env: Object.fromEntries(
        Object.entries({
          ...process.env,
          OPENCODE_PERMISSION: '{"*":"deny"}',
        }).filter(
          ([key]) =>
            ![
              "JWT_SECRET",
              "DATABASE_URL",
              "AUTH_ORIGINS",
              "AUTH_COOKIE_SECURE",
            ].includes(key),
        ),
      ),
    });

    if (!hasText) {
      throw new Error(
        "The provider returned no reply. Check its sign-in and selected model.",
      );
    }

    emit({ type: "usage", usage });
    emit({ type: "done" });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
