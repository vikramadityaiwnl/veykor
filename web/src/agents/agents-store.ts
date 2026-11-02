import { create } from "zustand";
import type { Agent, AgentsResponse, CreateAgentInput, ProjectAgent, ProjectAgentsResponse, UpdateAgentInput } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

interface AgentsState {
  agents: Agent[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  projectAgents: Record<string, ProjectAgent[]>;
  load: () => Promise<void>;
  loadForProject: (projectId: string) => Promise<void>;
  create: (input: CreateAgentInput) => Promise<Agent>;
  update: (id: string, input: UpdateAgentInput) => Promise<Agent>;
  remove: (id: string) => Promise<void>;
}

let loadVersion = 0;

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Veykor-Request": "1",
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "Request failed.";

    throw new Error(message);
  }

  return payload;
}

export const useAgentsStore = create<AgentsState>()((set, get) => ({
  agents: [],
  status: "idle",
  error: "",
  projectAgents: {},

  load: async () => {
    if (get().status === "loading") {
      return;
    }

    const version = ++loadVersion;

    set({ status: "loading", error: "" });

    try {
      const payload = (await requestJson("/api/agents")) as AgentsResponse;

      if (version === loadVersion) {
        set({ agents: payload.agents, status: "ready", error: "" });
      }
    } catch {
      if (version === loadVersion) {
        set({ status: "error", error: "Unable to load agents. Please retry." });
      }
    }
  },

  loadForProject: async (projectId) => {
    if (!projectId || get().projectAgents[projectId]) {
      return;
    }

    try {
      const payload = (await requestJson(
        `/api/agents?projectId=${encodeURIComponent(projectId)}`,
      )) as ProjectAgentsResponse;

      set({
        projectAgents: { ...get().projectAgents, [projectId]: payload.agents },
      });
    } catch {
      set({
        projectAgents: { ...get().projectAgents, [projectId]: [] },
      });
    }
  },

  create: async (input) => {
    const agent = (await requestJson("/api/agents", {
      method: "POST",
      body: JSON.stringify(input),
    })) as Agent;

    set({
      agents: [...get().agents, agent],
      projectAgents: {},
      status: "ready",
      error: "",
    });

    return agent;
  },

  update: async (id, input) => {
    const agent = (await requestJson(`/api/agents/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    })) as Agent;

    set({
      agents: get().agents.map((entry) => (entry.id === id ? agent : entry)),
      projectAgents: {},
    });

    return agent;
  },

  remove: async (id) => {
    await requestJson(`/api/agents/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    set({
      agents: get().agents.filter((entry) => entry.id !== id),
      projectAgents: {},
    });
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;
    useAgentsStore.setState({
      agents: [],
      status: "idle",
      error: "",
      projectAgents: {},
    });
  }
});
