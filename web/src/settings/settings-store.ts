import { create } from "zustand";
import type { SettingsProvider, SettingsResponse } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

interface SettingsState {
  providers: SettingsProvider[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  load: () => Promise<void>;
}

let loadVersion = 0;

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  providers: [],
  status: "idle",
  error: "",
  load: async () => {
    if (get().status === "loading" || get().status === "ready") {
      return;
    }
    const version = ++loadVersion;
    set({ status: "loading", error: "" });

    try {
      const response = await fetch("/api/settings", {
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error("Unable to load settings");
      }
      const settings = (await response.json()) as SettingsResponse;
      if (version === loadVersion) {
        set({
          providers: settings.providers,
          status: "ready",
          error: "",
        });
      }
    } catch {
      if (version === loadVersion) {
        set({
          status: "error",
          error: "Unable to load settings. Please retry from Settings.",
        });
      }
    }
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;
    useSettingsStore.setState({ providers: [], status: "idle", error: "" });
  }
});
