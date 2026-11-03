import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AgentPreferencesState {
  agents: Record<string, string>;
  select: (userId: number, projectId: string, agentId: string) => void;
}

export const useAgentPreferencesStore = create<AgentPreferencesState>()(
  persist(
    (set) => ({
      agents: {},
      select: (userId, projectId, agentId) => {
        set((state) => ({
          agents: { ...state.agents, [`${userId}:${projectId}`]: agentId },
        }));
      },
    }),
    {
      name: "veykor-agent-preferences",
      partialize: (state) => ({ agents: state.agents }),
    },
  ),
);
