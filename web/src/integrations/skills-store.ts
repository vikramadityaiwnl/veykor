import { create } from "zustand";
import type { DetectedSkillSource, DetectedSkillsResponse } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

interface SkillsState {
  sources: DetectedSkillSource[];
  status: "idle" | "loading" | "ready" | "error";
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

let loadVersion = 0;

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  sources: [],
  status: "idle",

  load: async () => {
    if (get().status === "loading" || get().status === "ready") {
      return;
    }

    await get().refresh();
  },

  refresh: async () => {
    const version = ++loadVersion;
    const userId = useAuthStore.getState().status?.user?.id;

    set({ status: "loading" });

    try {
      const response = await fetch("/api/integrations/skills", {
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Unable to load detected skills");
      }

      const payload = (await response.json()) as DetectedSkillsResponse;

      if (
        version === loadVersion &&
        userId === useAuthStore.getState().status?.user?.id
      ) {
        set({ sources: payload.sources || [], status: "ready" });
      }
    } catch {
      if (version === loadVersion) {
        set({ status: "error" });
      }
    }
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;
    useSkillsStore.setState({ sources: [], status: "idle" });
  }
});
