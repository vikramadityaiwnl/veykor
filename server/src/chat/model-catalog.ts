import type { ChatModel, ChatProvider } from "@veykor/shared";
import { tmpdir } from "node:os";
import { spawnMuse } from "./muse-host.js";

export function model(id: string, name = id): ChatModel {
  return {
    id,
    name,
    description: "",
    contextWindow: 0,
    inputPrice: 0,
    outputPrice: 0,
    pricingAvailable: false,
    inputModalities: [
      "text",
      ...(/^(muse-spark-1\.[123]|muse-wonder-1\.0)(-contributor)?$/.test(id)
        ? ["image" as const]
        : []),
    ],
  };
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
      cost: { input: string; output: string; currency: string } | null;
    }[];
    return {
      id: "muse",
      name: "Muse Code",
      version: muse.host.initializeResult.serverInfo.version,
      available: true,
      error: "",
      source: "Muse native model catalog · USD per million tokens",
      models: entries.map((entry) => ({
        ...model(entry.modelId, entry.displayLabel),
        description: entry.description || "",
        contextWindow: entry.contextLimit || 0,
        inputPrice: Number(entry.cost?.input) || 0,
        outputPrice: Number(entry.cost?.output) || 0,
        pricingAvailable: entry.cost?.currency === "USD",
      })),
    };
  } finally {
    await muse.close();
  }
}
