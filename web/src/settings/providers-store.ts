import { create } from "zustand";
import type { CliStatusResponse, ProviderCliStatus } from "@veykor/shared";

interface ProvidersState {
  cliProviders: ProviderCliStatus[];
  cliStatus: "idle" | "loading" | "ready" | "error";
  cliError: string;
  loadCli: () => Promise<void>;
}

function clearLegacyConnections(): void {
  try {
    localStorage.removeItem("veykor.provider-connections");
  } catch {
    return;
  }
}

clearLegacyConnections();

let loadVersion = 0;

export const useProvidersStore = create<ProvidersState>()((set, get) => ({
  cliProviders: [],
  cliStatus: "idle",
  cliError: "",

  loadCli: async () => {
    if (get().cliStatus === "loading") {
      return;
    }

    const version = ++loadVersion;

    set({ cliStatus: "loading" });

    try {
      const response = await fetch("/api/providers/cli-status", {
        credentials: "same-origin",
        headers: { "X-Veykor-Request": "1" },
      });

      const payload = (await response.json()) as CliStatusResponse;

      if (!response.ok) {
        throw new Error("Unable to detect installed tools");
      }

      if (version === loadVersion) {
        set({
          cliProviders: payload.providers,
          cliStatus: "ready",
          cliError: "",
        });
      }
    } catch {
      if (version === loadVersion) {
        set({
          cliStatus: "error",
          cliError: "Unable to detect installed tools. Please retry.",
        });
      }
    }
  },
}));
