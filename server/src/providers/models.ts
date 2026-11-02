import type { ChatModel } from "@veykor/shared";

export function createModel(id: string, name = id): ChatModel {
  return {
    id,
    name,
    description: "",
    contextWindow: 0,
    inputPrice: 0,
    cachedPrice: 0,
    outputPrice: 0,
    pricingAvailable: false,
    reasoningEfforts: [{ tier: "none", description: "" }],
    defaultReasoningEffort: "none",
    inputModalities: ["text"],
  };
}
