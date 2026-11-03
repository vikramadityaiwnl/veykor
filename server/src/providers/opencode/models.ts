import type { ChatProvider, ChatModel, ChatReasoningEffort } from "@veykor/shared";
import { createModel } from "../models.js";
import { isReasoningEffort } from "../reasoning-effort.js";
import { openCodeConnection } from "./connection.js";

export interface OpenCodeModel {
  id: string;
  modelID: string;
  providerID: string;
  name: string;
  enabled: boolean;
  variants: { id: string }[];
  capabilities: { input: string[] };
  limit: { context: number };
  cost: {
    input: number;
    output: number;
    cache: { read: number; write: number };
    tier?: { size: number };
  }[];
}

export function projectOpenCodeModel(entry: OpenCodeModel): ChatModel {
  const price = entry.cost.find((cost) => !cost.tier) || entry.cost[0];
  const tiers = entry.variants
    .map((variant) => variant.id)
    .filter(isReasoningEffort);
  const defaultReasoningEffort: ChatReasoningEffort = tiers.includes("high")
    ? "high"
    : tiers[0] || "none";

  return {
    ...createModel(`${entry.providerID}/${entry.id}`, entry.name),
    contextWindow: entry.limit.context || 0,
    inputPrice: price?.input || 0,
    outputPrice: price?.output || 0,
    cachedPrice: price?.cache.read || 0,
    pricingAvailable:
      !!price && Number.isFinite(price.input) && Number.isFinite(price.output),
    description:
      entry.cost.length > 1
        ? "Base price; higher context tiers may cost more."
        : "",
    inputModalities: entry.capabilities.input.includes("image")
      ? ["text", "image"]
      : ["text"],
    reasoningEfforts: (tiers.length ? tiers : ["none" as const]).map(
      (tier) => ({ tier, description: "" }),
    ),
    defaultReasoningEffort,
  };
}

export async function discoverOpencodeCatalog(): Promise<ChatProvider> {
  const host = await openCodeConnection();
  const result = await host.request("GET", "/api/model");
  const entries = (result.data as OpenCodeModel[]).filter(
    (entry) => entry.enabled,
  );

  if (!entries.length) {
    throw new Error(
      "No enabled OpenCode models found. Configure a provider in OpenCode first.",
    );
  }

  return {
    id: "opencode",
    name: "OpenCode",
    available: true,
    error: "",
    source: "OpenCode CLI model catalog · USD per million tokens",
    models: entries.map(projectOpenCodeModel),
  };
}

export function modelReference(modelId: string, effort: string) {
  const slash = modelId.indexOf("/");

  if (slash < 1 || slash === modelId.length - 1) {
    throw new Error("OpenCode model must use provider/model format");
  }

  return {
    providerID: modelId.slice(0, slash),
    id: modelId.slice(slash + 1),
    ...(effort === "none" ? {} : { variant: effort }),
  };
}
