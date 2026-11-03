import { create } from "zustand";
import type { AgentDefinition, WorkProject } from "@veykor/shared";
import { workRequest } from "./work-client.ts";

interface WorkState {
  agents: AgentDefinition[];
  projects: WorkProject[];
  loaded: boolean;
  projectId: string;
  agentId: string;
  error: string;
  load: () => Promise<void>;
  selectProject: (id: string) => void;
  selectAgent: (id: string) => void;
}

export const useWorkStore = create<WorkState>((set) => ({
  agents: [],
  projects: [],
  loaded: false,
  projectId: "",
  agentId: "",
  error: "",
  load: async () => {
    try {
      const [agents, projects] = await Promise.all([
        workRequest<AgentDefinition[]>("agents"),
        workRequest<WorkProject[]>("projects"),
      ]);
      set({ agents, projects, loaded: true, error: "" });
    } catch (cause) {
      set({
        loaded: true,
        error: cause instanceof Error ? cause.message : "Unable to load work.",
      });
    }
  },
  selectProject: (projectId) => set({ projectId, agentId: "" }),
  selectAgent: (agentId) => set({ agentId }),
}));
