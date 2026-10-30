import { defineTheme } from "@astryxdesign/core/theme";
import { themes } from "./astryx-themes";

export const veykorTheme = defineTheme({
  name: "veykor",
  extends: themes.neutral,
  typography: {
    body: {
      family: "Plus Jakarta Sans",
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: "Plus Jakarta Sans",
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      weight: "semibold",
    },
  },
  tokens: {
    "--text-body-weight": "300",
    "--text-supporting-weight": "300",
    "--text-heading-1-weight": "var(--font-weight-semibold)",
  },
});
