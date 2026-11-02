export function parseArgLines(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function parseEnvLines(value: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of value.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const entry = trimmed.slice(separator + 1).trim();

    if (key) {
      result[key] = entry;
    }
  }

  return result;
}

export function parseHeaderLines(value: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of value.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf(":");

    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const entry = trimmed.slice(separator + 1).trim();

    if (key) {
      result[key] = entry;
    }
  }

  return result;
}

export function formatEnvRecord(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([key, entry]) => `${key}=${entry}`)
    .join("\n");
}

export function formatHeaderRecord(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([key, entry]) => `${key}: ${entry}`)
    .join("\n");
}
