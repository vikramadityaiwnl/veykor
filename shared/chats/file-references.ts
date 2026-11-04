export type BrowserPreviewKind = "image" | "video" | null;

export const maxToolFileReferences = 32;

function fileExtension(filePath: string): string {
  const name = filePath.split(/[\\/]/).at(-1) ?? "";
  const index = name.lastIndexOf(".");

  return index <= 0 ? "" : name.slice(index + 1).toLowerCase();
}

function addPath(value: string, paths: Set<string>): void {
  const filePath = value.trim().replace(/[),.;!?]+$/, "");

  if (
    paths.size >= maxToolFileReferences ||
    !filePath.startsWith("/") ||
    /[\r\n]/.test(filePath) ||
    fileExtension(filePath) === ""
  ) {
    return;
  }

  paths.add(filePath);
}

function addStringPaths(
  value: string,
  paths: Set<string>,
  depth: number,
): void {
  if (paths.size >= maxToolFileReferences || depth > 8) {
    return;
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      addValuePaths(JSON.parse(trimmed) as unknown, paths, depth + 1);
    } catch {}
  }

  for (const line of value.split(/\r?\n/)) {
    const candidate = line.trim();

    if (candidate.startsWith("/")) {
      addPath(candidate, paths);
    }
  }

  for (const match of value.matchAll(/(["'])(\/[^"'\r\n]+)\1/g)) {
    if (match[2]) {
      addPath(match[2], paths);
    }
  }

  for (const match of value.matchAll(
    /(?:^|\s)(\/[^\s"'<>]+?\.[A-Za-z0-9]{1,16})(?=$|[\s"'`),;.!?])/g,
  )) {
    if (match[1]) {
      addPath(match[1], paths);
    }
  }
}

function addValuePaths(value: unknown, paths: Set<string>, depth = 0): void {
  if (paths.size >= maxToolFileReferences || depth > 8) {
    return;
  }

  if (typeof value === "string") {
    addStringPaths(value, paths, depth);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      addValuePaths(entry, paths, depth + 1);
    }

    return;
  }

  if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value)) {
      addValuePaths(entry, paths, depth + 1);
    }
  }
}

export function extractFilePathCandidates(
  ...values: Array<unknown>
): Array<string> {
  const paths = new Set<string>();

  for (const value of values) {
    addValuePaths(value, paths);

    if (paths.size >= maxToolFileReferences) {
      break;
    }
  }

  return [...paths];
}

export function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath;
}

export function browserPreviewKind(filePath: string): BrowserPreviewKind {
  const extension = fileExtension(filePath);

  if (
    ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes(extension)
  ) {
    return "image";
  }

  if (["mp4", "m4v", "webm", "ogv", "ogg"].includes(extension)) {
    return "video";
  }

  return null;
}
