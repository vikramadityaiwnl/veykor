import { usePreferencesStore } from "../workspace/preferences-store.ts";
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

export const useWorkStore = create<WorkState>((set, get) => ({
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
      const current = get();
      const assigned =
        projects.find((project) => project.id === current.projectId)
          ?.agentIds ?? [];
      const remembered =
        usePreferencesStore.getState().projectAgents[current.projectId] ?? "";

      set({
        agents,
        projects,
        loaded: true,
        error: "",
        agentId: assigned.includes(current.agentId)
          ? current.agentId
          : assigned.includes(remembered)
            ? remembered
            : "",
      });
    } catch (cause) {
      set({
        loaded: true,
        error: cause instanceof Error ? cause.message : "Unable to load work.",
      });
    }
  },
  selectProject: (projectId) => {
    const remembered =
      usePreferencesStore.getState().projectAgents[projectId] ?? "";
    const assigned =
      get().projects.find((project) => project.id === projectId)?.agentIds ??
      [];

    set({
      projectId,
      agentId: assigned.includes(remembered) ? remembered : "",
    });
  },
  selectAgent: (agentId) => {
    set({ agentId });

    if (get().projectId) {
      usePreferencesStore.getState().setProjectAgent(get().projectId, agentId);
    }
  },
}));
