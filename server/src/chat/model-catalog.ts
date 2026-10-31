import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatModel, ChatProvider, ProviderCliId } from "@veykor/shared";
import { runCli } from "./cli-process.js";

export function model(id: string, name = id): ChatModel {
  return {
    id,
    name,
    description: "",
    contextWindow: 0,
    inputPrice: 0,
    outputPrice: 0,
    pricingAvailable: false,
  };
}

export function parseOpenCodeModels(output: string): ChatModel[] {
  const models: ChatModel[] = [];

  for (const match of output.matchAll(/^(\S+\/\S+)\r?\n(\{[\s\S]*?^\})/gm)) {
    try {
      const entry = JSON.parse(match[2]);
      if (
        entry.status === "deprecated" ||
        entry.capabilities?.output?.text === false
      ) {
        continue;
      }
      models.push({
        ...model(match[1], entry.name || match[1]),
        contextWindow: Number(entry.limit?.context) || 0,
        inputPrice: Number(entry.cost?.input) || 0,
        outputPrice: Number(entry.cost?.output) || 0,
        pricingAvailable:
          typeof entry.cost?.input === "number" &&
          typeof entry.cost?.output === "number",
      });
    } catch {}
  }

  return models;
}

export async function discoverModelCatalog(
  id: ProviderCliId,
): Promise<ChatProvider> {
  const provider: ChatProvider = {
    id,
    name: {
      aider: "Aider",
      muse: "Muse Code",
      claude: "Claude",
      codex: "Codex",
      opencode: "OpenCode",
    }[id],
    available: false,
    error: "",
    source: "",
    models: [],
  };

  try {
    provider.available = true;

    if (id === "aider") {
      provider.available = false;
      provider.error = "Aider chat is not supported yet.";
      return provider;
    }
    if (id === "muse") {
      const output = await runCli(
        "muse",
        [
          "serve",
          "--no-session-log",
          "--preset",
          "empty",
          "--disable-shell",
          "--disable-write",
        ],
        {
          cwd: "/tmp",
          timeout: 15_000,
          input: [
            {
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                clientInfo: { name: "veykor", version: "0.0.0" },
              },
            },
            { jsonrpc: "2.0", method: "initialized", params: {} },
            { jsonrpc: "2.0", id: 2, method: "model/list", params: {} },
          ]
            .map((request) => JSON.stringify(request) + "\n")
            .join(""),
        },
      );
      const result = output
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .find((event) => event.id === 2)?.result;
      if (!result) {
        throw new Error("Muse model catalog is unavailable");
      }
      provider.models = result.models.map(
        (entry: {
          modelId: string;
          displayLabel: string;
          description: string;
          contextLimit: number;
          cost: {
            input: string;
            output: string;
            currency: string;
          } | null;
        }) => ({
          ...model(entry.modelId, entry.displayLabel),
          description: entry.description || "",
          contextWindow: entry.contextLimit || 0,
          inputPrice: Number(entry.cost?.input) || 0,
          outputPrice: Number(entry.cost?.output) || 0,
          pricingAvailable: entry.cost?.currency === "USD",
        }),
      );
      provider.source = "Muse model/list · USD per million tokens";
    } else if (id === "opencode") {
      provider.models = parseOpenCodeModels(
        await runCli(id, ["models", "--verbose"], { timeout: 15_000 }),
      );
      provider.source = "Installed OpenCode catalog · USD per million tokens";
    } else if (id === "claude") {
      provider.models = [
        model("sonnet", "Sonnet (latest)"),
        model("opus", "Opus (latest)"),
        model("haiku", "Haiku (latest)"),
      ];
      provider.source =
        "CLI aliases · context and pricing are not reported by this CLI";
    } else {
      provider.source =
        "Local Codex model cache · pricing is not reported by this CLI";
      try {
        const cache = JSON.parse(
          await readFile(
            join(
              process.env.CODEX_HOME || join(homedir(), ".codex"),
              "models_cache.json",
            ),
            "utf8",
          ),
        );
        provider.models = (cache.models || [])
          .filter(
            (entry: { visibility?: string }) => entry.visibility !== "hide",
          )
          .map(
            (entry: {
              slug: string;
              display_name: string;
              context_window?: number;
            }) => ({
              ...model(entry.slug, entry.display_name || entry.slug),
              contextWindow: entry.context_window || 0,
            }),
          );
      } catch {
        provider.source = "No local model cache available";
      }
    }
  } catch {
    provider.available = false;
    provider.error = `Unable to start ${provider.name}. Check its installation and sign-in.`;
  }

  return provider;
}
