import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { CreateMcpServerInput, McpTransport } from "@veykor/shared";

export interface DetectedEntry {
  key: string;
  name: string;
  input: CreateMcpServerInput;
}

export interface DetectedSourceScan {
  id: string;
  label: string;
  path: string;
  entries: DetectedEntry[];
}

interface RawEntry {
  key: string;
  name: string;
  raw: unknown;
}

interface Detector {
  id: string;
  label: string;
  candidates: (home: string) => string[];
  entries: (data: unknown) => RawEntry[];
  remove: (data: unknown, key: string) => boolean;
}

const claudeDesktopPath =
  platform() === "darwin"
    ? join(
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      )
    : join(".config", "Claude", "claude_desktop_config.json");

function serverMaps(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [];
  }

  const record = data as Record<string, unknown>;
  const maps: Record<string, unknown>[] = [];

  for (const key of ["mcpServers", "servers"]) {
    const candidate = record[key];

    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      maps.push(candidate as Record<string, unknown>);
    }
  }

  return maps;
}

function flatEntries(data: unknown): RawEntry[] {
  const maps = serverMaps(data);

  if (maps.length === 0) {
    return [];
  }

  return Object.entries(maps[0]).map(([name, raw]) => ({
    key: name,
    name,
    raw,
  }));
}

function flatRemove(data: unknown, key: string): boolean {
  for (const map of serverMaps(data)) {
    if (Object.hasOwn(map, key)) {
      delete map[key];
      return true;
    }
  }

  return false;
}

function flatDetector(id: string, label: string, relative: string): Detector {
  return {
    id,
    label,
    candidates: (home) => [join(home, relative)],
    entries: flatEntries,
    remove: flatRemove,
  };
}

const claudeCodeDetector: Detector = {
  id: "claude-code",
  label: "Claude Code",
  candidates: (home) => [join(home, ".claude.json")],
  entries: (data) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return [];
    }

    const projects = (data as Record<string, unknown>).projects;

    if (!projects || typeof projects !== "object" || Array.isArray(projects)) {
      return [];
    }

    const found: RawEntry[] = [];

    for (const [project, entry] of Object.entries(
      projects as Record<string, unknown>,
    )) {
      for (const map of serverMaps(entry)) {
        for (const [name, raw] of Object.entries(map)) {
          found.push({
            key: `${project}::${name}`,
            name,
            raw,
          });
        }
      }
    }

    return found;
  },
  remove: (data, key) => {
    const separator = key.lastIndexOf("::");

    if (separator <= 0) {
      return false;
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return false;
    }

    const projects = (data as Record<string, unknown>).projects;

    if (!projects || typeof projects !== "object" || Array.isArray(projects)) {
      return false;
    }

    const project = (projects as Record<string, unknown>)[
      key.slice(0, separator)
    ];

    for (const map of serverMaps(project)) {
      const name = key.slice(separator + 2);

      if (Object.hasOwn(map, name)) {
        delete map[name];
        return true;
      }
    }

    return false;
  },
};

const detectors: Detector[] = [
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    candidates: (home) => [join(home, claudeDesktopPath)],
    entries: flatEntries,
    remove: flatRemove,
  },
  claudeCodeDetector,
  flatDetector("cursor", "Cursor", join(".cursor", "mcp.json")),
  flatDetector(
    "windsurf",
    "Windsurf",
    join(".codeium", "windsurf", "mcp_config.json"),
  ),
  flatDetector("gemini-cli", "Gemini CLI", join(".gemini", "settings.json")),
  flatDetector("muse-code", "Muse Code", join(".muse", "mcp.json")),
];

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }

  return result;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function httpUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  try {
    const parsed = new URL(value.trim());

    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? value.trim()
      : "";
  } catch {
    return "";
  }
}

export function normalizeDetectedEntry(
  name: string,
  raw: unknown,
): CreateMcpServerInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const trimmed = name.trim();

  if (!trimmed) {
    return null;
  }

  const type = typeof candidate.type === "string" ? candidate.type : "";
  const command =
    typeof candidate.command === "string" ? candidate.command.trim() : "";
  const url = httpUrl(candidate.url);

  let transport: McpTransport | null = null;

  if (command && (type === "" || type === "stdio")) {
    transport = "stdio";
  } else if (
    url &&
    (type === "http" || type === "streamable-http" || type === "streamableHttp")
  ) {
    transport = "http";
  } else if (url && (type === "" || type === "sse")) {
    transport = "sse";
  }

  if (!transport) {
    return null;
  }

  return {
    name: trimmed,
    transport,
    command: transport === "stdio" ? command : "",
    args: transport === "stdio" ? stringList(candidate.args) : [],
    env: transport === "stdio" ? stringRecord(candidate.env) : {},
    url: transport === "stdio" ? "" : url,
    headers: transport === "stdio" ? {} : stringRecord(candidate.headers),
    enabled: true,
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveFile(detector: Detector, home: string): string | null {
  for (const candidate of detector.candidates(home)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function scanDetectedServers(
  home: string = homedir(),
): DetectedSourceScan[] {
  const sources: DetectedSourceScan[] = [];

  for (const detector of detectors) {
    const path = resolveFile(detector, home);

    if (!path) {
      continue;
    }

    let data: unknown;

    try {
      data = readJson(path);
    } catch {
      continue;
    }

    const entries: DetectedEntry[] = [];

    for (const item of detector.entries(data)) {
      const input = normalizeDetectedEntry(item.name, item.raw);

      if (input) {
        entries.push({ key: item.key, name: input.name, input });
      }
    }

    if (entries.length > 0) {
      entries.sort((a, b) => a.name.localeCompare(b.name));
      sources.push({ id: detector.id, label: detector.label, path, entries });
    }
  }

  return sources;
}

export function readDetectedEntry(
  home: string,
  sourceId: string,
  serverKey: string,
): CreateMcpServerInput | null {
  const detector = detectors.find((entry) => entry.id === sourceId);
  const path = detector ? resolveFile(detector, home) : null;

  if (!detector || !path) {
    return null;
  }

  let data: unknown;

  try {
    data = readJson(path);
  } catch {
    return null;
  }

  const item = detector.entries(data).find((entry) => entry.key === serverKey);

  return item ? normalizeDetectedEntry(item.name, item.raw) : null;
}

export function removeDetectedEntry(
  home: string,
  sourceId: string,
  serverKey: string,
): boolean {
  const detector = detectors.find((entry) => entry.id === sourceId);
  const path = detector ? resolveFile(detector, home) : null;

  if (!detector || !path) {
    return false;
  }

  let data: unknown;

  try {
    data = readJson(path);
  } catch {
    return false;
  }

  if (!detector.remove(data, serverKey)) {
    return false;
  }

  const backup = `${path}.bak`;

  if (!existsSync(backup)) {
    writeFileSync(backup, readFileSync(path));
  }

  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

  return true;
}

export function detectedFingerprint(input: {
  transport: string;
  command: string;
  args: string[];
  url: string;
}): string {
  return [input.transport, input.command, ...input.args, input.url].join("\n");
}
