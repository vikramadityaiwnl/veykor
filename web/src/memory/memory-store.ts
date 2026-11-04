import { create } from "zustand";
import type { MemorySummary } from "@veykor/shared";
import { fetchMemories } from "./memory-client.ts";

interface MemoryState {
  memories: Array<MemorySummary>;
  loaded: boolean;
  loading: boolean;
  error: string;
  scopeFilter: "" | "global" | "project";
  projectFilter: string;
  query: string;
  load: () => Promise<void>;
  setScopeFilter: (value: "" | "global" | "project") => void;
  setProjectFilter: (value: string) => void;
  setQuery: (value: string) => void;
}

export const useMemoryStore = create<MemoryState>()((set, get) => ({
  memories: [],
  loaded: false,
  loading: false,
  error: "",
  scopeFilter: "",
  projectFilter: "",
  query: "",

  load: async () => {
    const state = get();

    set({ loading: true, error: "" });

    try {
      const response = await fetchMemories({
        scope: state.scopeFilter === "" ? undefined : state.scopeFilter,
        projectId: state.projectFilter,
        query: state.query,
      });

      set({ memories: response.memories, loaded: true, loading: false });
    } catch (cause) {
      set({
        loading: false,
        error:
          cause instanceof Error ? cause.message : "Unable to load memories.",
      });
    }
  },

  setScopeFilter: (value) => {
    set({
      scopeFilter: value,
      projectFilter: value === "project" ? get().projectFilter : "",
    });

    void get().load();
  },

  setProjectFilter: (value) => {
    set({ projectFilter: value });

    void get().load();
  },

  setQuery: (value) => {
    set({ query: value });

    void get().load();
  },
}));
