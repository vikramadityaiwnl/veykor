import type { GeneralPreferences } from "@veykor/shared";
import { useAuthStore } from "./auth/auth-store";
import { create } from "zustand";

type ColorMode = "light" | "dark";

interface ThemeState {
  mode: ColorMode;
  toggle: () => void;
  load: () => Promise<void>;
  save: (mode: ColorMode) => Promise<void>;
}

function initialMode(): ColorMode {
  try {
    const saved = localStorage.getItem("veykor-color-mode");

    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode(),
  load: async () => {
    const userId = useAuthStore.getState().status?.user?.id;
    const response = await fetch("/api/settings/general", {
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error("Unable to load preferences");
    }

    const preferences: GeneralPreferences = await response.json();

    if (userId === useAuthStore.getState().status?.user?.id) {
      set({ mode: preferences.theme });
    }
  },
  save: async (mode) => {
    const userId = useAuthStore.getState().status?.user?.id;
    const response = await fetch("/api/settings/general", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Veykor-Request": "1" },
      body: JSON.stringify({ theme: mode } satisfies GeneralPreferences),
    });

    if (!response.ok) {
      throw new Error("Unable to save your preference. Please try again.");
    }

    if (userId === useAuthStore.getState().status?.user?.id) {
      set({ mode });
    }
  },
  toggle: () =>
    set((state) => {
      const mode = state.mode === "dark" ? "light" : "dark";

      try {
        localStorage.setItem("veykor-color-mode", mode);
      } catch {
        return { mode };
      }

      return { mode };
    }),
}));
