import { create } from "zustand";
import type { McpServerSummary, SkillSummary } from "@veykor/shared";
import { fetchMcpServers, fetchSkills } from "./integrations-client.ts";

interface IntegrationsState {
  servers: Array<McpServerSummary>;
  skills: Array<SkillSummary>;
  stdioAllowed: boolean;
  loaded: boolean;
  loading: boolean;
  error: string;
  load: () => Promise<void>;
}

export const useIntegrationsStore = create<IntegrationsState>()((set) => ({
  servers: [],
  skills: [],
  stdioAllowed: false,
  loaded: false,
  loading: false,
  error: "",

  load: async () => {
    set({ loading: true, error: "" });

    try {
      const [servers, skills] = await Promise.all([
        fetchMcpServers(),
        fetchSkills(),
      ]);

      set({
        servers: servers.servers,
        skills: skills.skills,
        stdioAllowed: servers.stdioAllowed,
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
