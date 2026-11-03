import { create } from "zustand";
import type { McpServerSummary } from "@veykor/shared";
import { fetchMcpServers } from "./integrations-client.ts";

interface IntegrationsState {
  servers: Array<McpServerSummary>;
  stdioAllowed: boolean;
  loaded: boolean;
  loading: boolean;
  error: string;
  load: () => Promise<void>;
}

export const useIntegrationsStore = create<IntegrationsState>()((set) => ({
  servers: [],
  stdioAllowed: false,
  loaded: false,
  loading: false,
  error: "",

  load: async () => {
    set({ loading: true, error: "" });

    try {
      const response = await fetchMcpServers();

      set({
        servers: response.servers,
        stdioAllowed: response.stdioAllowed,
        loaded: true,
        loading: false,
      });
    } catch (cause) {
      set({
        loading: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to load integrations.",
      });
    }
  },
}));
