import type { ChatModel, ChatProvider, ChatReasoningEffort } from "@veykor/shared";
import { tmpdir } from "node:os";
import { spawnMuse } from "./muse-host.js";
import { isReasoningEffort, reasoningEffortTiers } from "./reasoning-effort.js";

export function model(id: string, name = id): ChatModel {
  return {
    id,
    name,
    description: "",
    contextWindow: 0,
    inputPrice: 0,
    cachedPrice: 0,
    outputPrice: 0,
    pricingAvailable: false,
    reasoningEfforts: reasoningEffortTiers.map((tier) => ({
      tier,
      description: "",
    })),
    defaultReasoningEffort: "max",
    inputModalities: [
      "text",
      ...(/^(muse-spark-1\.[123]|muse-wonder-1\.0)(-contributor)?$/.test(id)
        ? ["image" as const]
        : []),
    ],
  };
}

function catalogTiers(value: unknown): ChatReasoningEffort[] {
  const tiers = Array.isArray(value)
    ? value.filter(isReasoningEffort)
    : reasoningEffortTiers;

  return tiers.length > 0 ? tiers : reasoningEffortTiers;
}

export async function discoverModelCatalog(): Promise<
  ChatProvider & { version: string }
> {
  const muse = await spawnMuse(tmpdir());
  try {
    const result = await muse.connection.request("model/list", {});
    const entries = result.models as {
      modelId: string;
      displayLabel: string;
      description: string | null;
      contextLimit: number | null;
      defaultReasoningEffort?: string;
      reasoningEffortVariants?: { tier: string; description?: string }[];
      variants?: string[] | "unknown";
      cost: {
        input: string;
        cached: string;
        output: string;
        currency: string;
      } | null;
    }[];
    return {
      id: "muse",
      name: "Muse Code",
      version: muse.host.initializeResult.serverInfo.version,
      available: true,
      error: "",
      source: "Muse native model catalog · USD per million tokens",
      models: entries.map((entry) => {
        const tiers = catalogTiers(entry.variants);
        const described = new Map(
          (entry.reasoningEffortVariants || []).map((option) => [
            option.tier,
            option.description || "",
          ]),
        );
        const catalogDefault = isReasoningEffort(entry.defaultReasoningEffort)
          ? entry.defaultReasoningEffort
          : undefined;

        return {
          ...model(entry.modelId, entry.displayLabel),
          description: entry.description || "",
          contextWindow: entry.contextLimit || 0,
          inputPrice: Number(entry.cost?.input) || 0,
          cachedPrice: Number(entry.cost?.cached) || 0,
          outputPrice: Number(entry.cost?.output) || 0,
          pricingAvailable: entry.cost?.currency === "USD",
          reasoningEfforts: tiers.map((tier) => ({
            tier,
            description: described.get(tier) || "",
          })),
          defaultReasoningEffort:
            catalogDefault && tiers.includes(catalogDefault)
              ? catalogDefault
              : tiers.includes("max")
                ? "max"
                : tiers[0],
        };
      }),
    };
  } finally {
    await muse.close();
  }
}
