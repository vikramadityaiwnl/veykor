import type { Theme } from "./theme-store.ts";

export interface StatusTone {
  text: string;
  solid: string;
  onSolid: string;
  soft: string;
  onSoft: string;
}

export interface ThemePalette {
  canvas: string;
  sidebar: string;
  surface: string;
  elevated: string;
  sunken: string;
  edgeSoft: string;
  edge: string;
  edgeHard: string;
  ink: string;
  inkSoft: string;
  inkMute: string;
  inkFaint: string;
  inkInvert: string;
  accent: string;
  accentHover: string;
  accentInk: string;
  success: StatusTone;
  warn: StatusTone;
  info: StatusTone;
  danger: StatusTone;
}

export const darkTheme: ThemePalette = {
  canvas: "#212121",
  sidebar: "#171717",
  surface: "#2a2a2a",
  elevated: "#333333",
  sunken: "#161616",
  edgeSoft: "#2e2e2e",
  edge: "#3f3f3f",
  edgeHard: "#525252",
  ink: "#ececec",
  inkSoft: "#b4b4b4",
  inkMute: "#9a9a9a",
  inkFaint: "#767676",
  inkInvert: "#171717",
  accent: "#ececec",
  accentHover: "#ffffff",
  accentInk: "#212121",
  success: {
    text: "#34d399",
    solid: "#059669",
    onSolid: "#ffffff",
    soft: "#064e3b",
    onSoft: "#a7f3d0",
  },
  warn: {
    text: "#fbbf24",
    solid: "#d97706",
    onSolid: "#18181b",
    soft: "#78350f",
    onSoft: "#fde68a",
  },
  info: {
    text: "#38bdf8",
    solid: "#0284c4",
    onSolid: "#ffffff",
    soft: "#0c4a6e",
    onSoft: "#bae6fd",
  },
  danger: {
    text: "#fb7185",
    solid: "#e11d48",
    onSolid: "#ffffff",
    soft: "#881337",
    onSoft: "#fecdd3",
  },
};

export const lightTheme: ThemePalette = {
  canvas: "#f1f1f3",
  sidebar: "#fafafa",
  surface: "#ffffff",
  elevated: "#ffffff",
  sunken: "#e7e7ea",
  edgeSoft: "#e4e4e7",
  edge: "#d4d4d8",
  edgeHard: "#a1a1aa",
  ink: "#18181b",
  inkSoft: "#3f3f46",
  inkMute: "#52525b",
  inkFaint: "#a1a1aa",
  inkInvert: "#fafafa",
  accent: "#18181b",
  accentHover: "#27272a",
  accentInk: "#fafafa",
  success: {
    text: "#059669",
    solid: "#059669",
    onSolid: "#ffffff",
    soft: "#d1fae5",
    onSoft: "#065f46",
  },
  warn: {
    text: "#b45309",
    solid: "#d97706",
    onSolid: "#18181b",
    soft: "#fef3c7",
    onSoft: "#92400e",
  },
  info: {
    text: "#0284c4",
    solid: "#0284c4",
    onSolid: "#ffffff",
    soft: "#e0f2fe",
    onSoft: "#0c4a6e",
  },
  danger: {
    text: "#dc2626",
    solid: "#dc2626",
    onSolid: "#ffffff",
    soft: "#fee2e2",
    onSoft: "#991b1b",
  },
};

export const themes: Record<Theme, ThemePalette> = {
  dark: darkTheme,
  light: lightTheme,
};

function toVariableName(path: Array<string>): string {
  const kebab = path
    .map((part) =>
      part.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
    )
    .join("-");

  return `--veykor-${kebab}`;
}

export function flattenPalette(palette: ThemePalette): Array<[string, string]> {
  const entries: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(palette)) {
    if (typeof value === "string") {
      entries.push([toVariableName([key]), value]);
    } else {
      for (const [toneKey, toneValue] of Object.entries(value)) {
        entries.push([toVariableName([key, toneKey]), toneValue as string]);
      }
    }
  }

  return entries;
}

export function applyThemeVariables(theme: Theme): void {
  const root = document.documentElement;

  for (const [name, value] of flattenPalette(themes[theme])) {
    root.style.setProperty(name, value);
  }
}

export const themeColors = {
  dimmed: "text-zinc-500",
  muted: "text-zinc-400",
  primary: "text-zinc-50",
} as const;

export type ThemeColor = keyof typeof themeColors;

export const semanticColors = {
  success: {
    text: "text-emerald-400",
    button: "bg-emerald-500 hover:bg-emerald-400 text-white",
    soft: "bg-emerald-700 hover:bg-emerald-600 text-emerald-50",
  },
  warning: {
    text: "text-amber-400",
    button: "bg-amber-500 hover:bg-amber-400 text-zinc-950",
  },
  info: {
    text: "text-sky-400",
    button: "bg-sky-500 hover:bg-sky-400 text-white",
  },
  delete: {
    text: "text-red-400",
    button: "bg-red-600 hover:bg-red-500 text-white",
    soft: "bg-red-800 hover:bg-red-700 text-red-50",
  },
} as const;

export type SemanticTone = keyof typeof semanticColors;
