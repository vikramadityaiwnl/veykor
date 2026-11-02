import type { ChatDefaults, ChatPermissionMode, ChatReasoningEffort, ProviderCliId } from "@veykor/shared";
import { isReasoningEffort } from "../chat/reasoning-effort.js";

const permissionModes: ChatPermissionMode[] = [
  "promptUnmatched",
  "onRequest",
  "denyUnmatched",
  "allowAll",
];

const providerIds: ProviderCliId[] = ["muse", "opencode"];

const modelPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:@+/-]{0,199}$/;

export function emptyChatDefaults(): ChatDefaults {
  return {
    defaultProviderId: "",
    models: {},
    efforts: {},
    permissionMode: "promptUnmatched",
  };
}

function sanitizedModels(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const models: Record<string, string> = {};

  for (const [providerId, modelId] of Object.entries(value)) {
    if (
      providerIds.includes(providerId as ProviderCliId) &&
      typeof modelId === "string" &&
      modelId !== "" &&
      modelPattern.test(modelId)
    ) {
      models[providerId] = modelId;
    }
  }

  return models;
}

function sanitizedEfforts(value: unknown): Record<string, ChatReasoningEffort> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const efforts: Record<string, ChatReasoningEffort> = {};

  for (const [modelId, effort] of Object.entries(value)) {
    if (modelPattern.test(modelId) && isReasoningEffort(effort)) {
      efforts[modelId] = effort;
    }
  }

  return efforts;
}

export function parseChatDefaults(value: unknown): ChatDefaults {
  let parsed: unknown = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return emptyChatDefaults();
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyChatDefaults();
  }

  const candidate = parsed as Partial<ChatDefaults>;

  return {
    defaultProviderId: providerIds.includes(
      candidate.defaultProviderId as ProviderCliId,
    )
      ? (candidate.defaultProviderId as string)
      : "",
    models: sanitizedModels(candidate.models),
    efforts: sanitizedEfforts(candidate.efforts),
    permissionMode: permissionModes.includes(
      candidate.permissionMode as ChatPermissionMode,
    )
      ? (candidate.permissionMode as ChatPermissionMode)
      : "promptUnmatched",
  };
}

export function validChatDefaults(value: unknown): value is ChatDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const input = value as ChatDefaults;

  if (
    typeof input.defaultProviderId !== "string" ||
    (input.defaultProviderId !== "" &&
      !providerIds.includes(input.defaultProviderId as ProviderCliId))
  ) {
    return false;
  }

  if (
    !input.models ||
    typeof input.models !== "object" ||
    Array.isArray(input.models) ||
    Object.entries(input.models).length > providerIds.length
  ) {
    return false;
  }

  if (
    !input.efforts ||
    typeof input.efforts !== "object" ||
    Array.isArray(input.efforts) ||
    Object.entries(input.efforts).length > 100
  ) {
    return false;
  }

  if (!permissionModes.includes(input.permissionMode)) {
    return false;
  }

  return (
    Object.entries(input.models).every(
      ([providerId, modelId]) =>
        providerIds.includes(providerId as ProviderCliId) &&
        typeof modelId === "string" &&
        modelId !== "" &&
        modelPattern.test(modelId),
    ) &&
    Object.entries(input.efforts).every(
      ([modelId, effort]) =>
        modelPattern.test(modelId) && isReasoningEffort(effort),
    )
  );
}
