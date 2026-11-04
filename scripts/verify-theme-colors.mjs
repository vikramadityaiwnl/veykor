import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  darkTheme,
  flattenPalette,
  lightTheme,
  themes,
} from "../web/src/theme/theme-colors.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function check(name, passed, detail = "") {
  const status = passed ? "PASS" : "FAIL";

  console.log(`${status}  ${name}${detail === "" ? "" : `  (${detail})`}`);

  if (!passed) {
    failures.push(name);
  }
}

function keysOf(value) {
  return Object.keys(value).sort();
}

function leavesOf(value, prefix = "") {
  if (typeof value === "string") {
    return [[prefix, value]];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    leavesOf(child, prefix === "" ? key : `${prefix}.${key}`),
  );
}

function luminance(hex) {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(
    (part) => {
      const channel = parseInt(part, 16) / 255;

      return channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    },
  );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));

  return (lighter + 0.05) / (darker + 0.05);
}

const hexPattern = /^#[0-9a-f]{6}$/i;

check(
  "themes record exposes dark and light",
  keysOf(themes).join(",") === "dark,light",
);

check(
  "dark and light share the same top-level keys",
  JSON.stringify(keysOf(darkTheme)) === JSON.stringify(keysOf(lightTheme)),
);

const darkLeaves = leavesOf(darkTheme);
const lightLeaves = leavesOf(lightTheme);

check(
  "dark and light share the same nested keys",
  JSON.stringify(darkLeaves.map(([path]) => path)) ===
    JSON.stringify(lightLeaves.map(([path]) => path)),
  `${darkLeaves.length} tokens`,
);

const invalid = [...darkLeaves, ...lightLeaves].filter(
  ([, value]) => !hexPattern.test(value),
);

check(
  "every token is a #rrggbb hex color",
  invalid.length === 0,
  invalid.length === 0
    ? `${darkLeaves.length * 2} values`
    : invalid.map(([path]) => path).join(","),
);

const darkCanvas = luminance(darkTheme.canvas);

check(
  "dark canvas is grayish, not pitch black",
  darkCanvas > luminance("#101014"),
  darkTheme.canvas,
);

check(
  "dark canvas is still dark",
  darkCanvas < luminance("#52525b"),
  darkTheme.canvas,
);

check(
  "light canvas is light",
  luminance(lightTheme.canvas) > luminance("#d4d4d8"),
  lightTheme.canvas,
);

const darkInkContrast = contrastRatio(darkTheme.ink, darkTheme.canvas);
const lightInkContrast = contrastRatio(lightTheme.ink, lightTheme.canvas);

check(
  "dark primary text contrasts on canvas",
  darkInkContrast >= 7,
  darkInkContrast.toFixed(1),
);

check(
  "light primary text contrasts on canvas",
  lightInkContrast >= 7,
  lightInkContrast.toFixed(1),
);

const darkAccentContrast = contrastRatio(darkTheme.accentInk, darkTheme.accent);
const lightAccentContrast = contrastRatio(
  lightTheme.accentInk,
  lightTheme.accent,
);

check(
  "dark accent text contrasts on accent",
  darkAccentContrast >= 7,
  darkAccentContrast.toFixed(1),
);

check(
  "light accent text contrasts on accent",
  lightAccentContrast >= 7,
  lightAccentContrast.toFixed(1),
);

const css = readFileSync(join(root, "web", "src", "index.css"), "utf8");
const variableNames = new Set(flattenPalette(darkTheme).map(([name]) => name));
const cssReferences = [...css.matchAll(/var\((--veykor-[a-z-]+)\)/g)].map(
  (match) => match[1],
);
const missing = cssReferences.filter((name) => !variableNames.has(name));

check(
  "every --veykor-* variable used in css exists in the palette",
  cssReferences.length > 0 && missing.length === 0,
  `${cssReferences.length} references`,
);

const darkMutedContrast = contrastRatio(darkTheme.inkMute, darkTheme.canvas);
const darkFaintContrast = contrastRatio(darkTheme.inkFaint, darkTheme.canvas);

check(
  "dark muted text stays readable on canvas",
  darkMutedContrast >= 4.5,
  darkMutedContrast.toFixed(1),
);

check(
  "dark faint text keeps a decorative floor on canvas",
  darkFaintContrast >= 3,
  darkFaintContrast.toFixed(1),
);

check(
  "dark theme overrides the zinc background scale",
  css.includes('[data-theme="dark"]') &&
    css.includes("--color-zinc-950: #212121"),
);

check(
  "dark theme lifts the muted zinc text ramp",
  css.includes("--color-zinc-500: #8e8e8e") &&
    css.includes("--color-zinc-400: #b4b4b4"),
);

check(
  "light theme darkens muted zinc text",
  css.includes("--color-zinc-500: #6e6e6e"),
);

if (failures.length > 0) {
  console.error(`\n${failures.length} theme check(s) failed.`);

  process.exit(1);
}

console.log("\nAll theme checks passed.");
