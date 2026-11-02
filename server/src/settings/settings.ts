import type { SettingsProvider, SettingsResponse } from "@veykor/shared";
import { knownProviderIds, providerRegistration } from "../chat/chat-runner.js";

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
    const providers: SettingsProvider[] = [];

    for (const id of knownProviderIds()) {
      const registration = providerRegistration(id)!;
      const base = {
        id,
        label: registration.meta.label,
        company: registration.meta.company,
        cli: registration.meta.cli,
        name: registration.meta.label,
        installed: false,
        version: "",
        available: false,
        error: "",
        source: "",
        models: [],
      };

      if (!registration.discoverCatalog) {
        providers.push({
          ...base,
          error: `${registration.meta.label} is not available`,
        });

        continue;
      }

      try {
        providers.push({
          ...base,
          ...(await registration.discoverCatalog()),
          installed: true,
        });
      } catch (error) {
        providers.push({
          ...base,
          error:
            error instanceof Error
              ? error.message
              : `Unable to start ${registration.meta.label}`,
        });
      }
    }

    cached = { providers };
    expires = Date.now() + 60_000;
    return cached;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
