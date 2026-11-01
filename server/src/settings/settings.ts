import type { SettingsResponse } from "@veykor/shared";
import { discoverModelCatalog } from "../chat/model-catalog.js";

let cached: SettingsResponse | undefined;
let expires = 0;
let pending: Promise<SettingsResponse> | undefined;

export function getSettings(refresh = false): Promise<SettingsResponse> {
  if (pending) {
    return pending;
  }
  if (!refresh && cached && expires > Date.now()) {
    return Promise.resolve(cached);
  }
  pending = (async () => {
    const base = {
      id: "muse" as const,
      label: "Muse Code",
      company: "Meta",
      cli: "muse",
      name: "Muse Code",
      installed: false,
      version: "",
      available: false,
      error: "",
      source: "",
      models: [],
    };
    try {
      cached = {
        providers: [
          { ...base, ...(await discoverModelCatalog()), installed: true },
        ],
      };
    } catch (error) {
      cached = {
        providers: [
          {
            ...base,
            error:
              error instanceof Error
                ? error.message
                : "Unable to start Muse Code",
          },
        ],
      };
    }
    expires = Date.now() + 60_000;
    return cached;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
