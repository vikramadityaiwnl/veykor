import { create } from "zustand";
import type { SystemStatusResponse } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

interface StatusState {
  data: SystemStatusResponse | null;
  loadState: "idle" | "loading" | "ready" | "error";
  error: string;
  load: () => Promise<void>;
}

let loading = false;
let loadVersion = 0;

export const useStatusStore = create<StatusState>()((set) => ({
  data: null,
  loadState: "idle",
  error: "",
  load: async () => {
    if (loading) {
      return;
    }

    loading = true;
    const version = ++loadVersion;

    set((state) => (state.data ? {} : { loadState: "loading", error: "" }));

    try {
      const response = await fetch("/api/status", {
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Unable to load host status");
      }

      const data = (await response.json()) as SystemStatusResponse;

      if (version === loadVersion) {
        set({ data, loadState: "ready", error: "" });
      }
    } catch {
      if (version === loadVersion) {
        set((state) =>
          state.data
            ? { error: "Refresh failed. Showing the last known status." }
            : {
                loadState: "error",
                error: "Unable to load host status. Please try again.",
              },
        );
      }
    } finally {
      loading = false;
    }
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;
    loading = false;
    useStatusStore.setState({ data: null, loadState: "idle", error: "" });
  }
});
