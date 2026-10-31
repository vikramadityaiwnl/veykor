import type { ProviderCliId, SettingsProvider, SettingsResponse } from "@veykor/shared";
import { discoverModelCatalog } from "../chat/model-catalog.js";
import { runCli } from "../chat/cli-process.js";

const providers: { id: ProviderCliId; label: string; company: string }[] = [
  { id: "aider", label: "Aider", company: "Aider" },
  { id: "claude", label: "Claude", company: "Anthropic" },
  { id: "codex", label: "Codex", company: "OpenAI" },
  { id: "muse", label: "Muse Code", company: "Meta" },
  { id: "opencode", label: "OpenCode", company: "SST" },
];

let cached: SettingsResponse | undefined;
let expires = 0;
let pending: Promise<SettingsResponse> | undefined;

async function detectProvider(
  entry: (typeof providers)[number],
): Promise<SettingsProvider> {
  const provider: SettingsProvider = {
    ...entry,
    cli: entry.id,
    name: entry.label,
    installed: false,
    version: "",
    available: false,
    error: "",
    source: "",
    models: [],
  };

  try {
    const version = await runCli(entry.id, ["--version"], { timeout: 6000 });
    provider.installed = true;
    provider.version = version.split("\n")[0].trim().slice(0, 120);
  } catch {
    provider.error = `${entry.label} is not installed or could not start.`;
    return provider;
  }

  return { ...provider, ...(await discoverModelCatalog(entry.id)) };
}

export function getSettings(refresh = false): Promise<SettingsResponse> {
  if (pending) {
    return pending;
  }
  if (!refresh && cached && expires > Date.now()) {
    return Promise.resolve(cached);
  }

  pending = Promise.all(providers.map(detectProvider))
    .then((providers) => {
      providers.sort(
        (a, b) =>
          Number(b.installed) - Number(a.installed) ||
          a.label.localeCompare(b.label),
      );
      cached = { providers };
      expires = Date.now() + 60_000;
      return cached;
    })
    .finally(() => {
      pending = undefined;
    });

  return pending;
}
