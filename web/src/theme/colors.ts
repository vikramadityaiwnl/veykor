export const themeColors = {
  dimmed: "text-zinc-500",
  muted: "text-zinc-400",
  primary: "text-zinc-50",
} as const;

export type ThemeColor = keyof typeof themeColors;
