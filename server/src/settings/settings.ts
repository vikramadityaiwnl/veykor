import type { SettingsProvider, SettingsResponse } from "@veykor/shared";
import { knownProviderIds, providerRegistration } from "../providers/index.js";

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
    const providers = await Promise.all(
      knownProviderIds().map(async (id): Promise<SettingsProvider> => {
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

        const probe = await registration.detectCLI();
        const detected = {
          ...base,
          installed: probe.installed,
          version: probe.version,
        };

        if (!probe.installed || !registration.discoverCatalog) {
          return {
            ...detected,
            error: probe.installed
              ? ""
              : `${registration.meta.label} CLI not found`,
          };
        }

        try {
          return {
            ...detected,
            ...(await registration.discoverCatalog()),
            installed: true,
          };
        } catch (error) {
          return {
            ...detected,
            error:
              error instanceof Error
                ? error.message
                : `Unable to start ${registration.meta.label}`,
          };
        }
      }),
    );

    cached = { providers };
    expires = Date.now() + 60_000;
    return cached;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
