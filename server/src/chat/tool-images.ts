import { realpathSync } from "node:fs";
import { basename, extname, resolve, sep } from "node:path";

const imageMimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export function imageMimeType(path: string): string {
  return imageMimeTypes[extname(path).toLowerCase()] || "";
}

export function savedScreenshotPaths(visibleOutput: string): string[] {
  const paths: string[] = [];

  for (const match of visibleOutput.matchAll(
    /Saved screenshot to\s+(\/[^\n"]+?\.(?:png|jpe?g|webp))\.?(?=\s|$)/gi,
  )) {
    const path = match[1].trim();

    if (!paths.includes(path)) {
      paths.push(path);
    }
  }

  return paths;
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function isInsideFolder(folder: string, path: string): boolean {
  const root = canonical(folder);
  const target = canonical(path);

  return target === root || target.startsWith(`${root}${sep}`);
}

export function screenshotName(path: string): string {
  return basename(path) || "screenshot.png";
}
