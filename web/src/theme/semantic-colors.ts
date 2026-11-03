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
