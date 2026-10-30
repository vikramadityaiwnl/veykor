import { create } from "zustand";

type ColorMode = "light" | "dark";

interface ThemeState {
  mode: ColorMode;
  toggle: () => void;
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
