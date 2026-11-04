import { mcpSecretNameError } from "@veykor/shared";
import type { McpSecretPatch } from "@veykor/shared";

export type SecretKind = "env" | "headers";

export interface SecretRow {
  id: string;
  name: string;
  value: string;
  savedName: string | null;
}

function rowKey(kind: SecretKind, name: string): string {
  return kind === "headers" ? name.toLowerCase() : name;
}

export function secretRowErrors(
  kind: SecretKind,
  rows: Array<SecretRow>,
): Map<string, string> {
  const errors = new Map<string, string>();
  const seen = new Set<string>();
  const label = kind === "headers" ? "header" : "environment variable";

  for (const row of rows) {
    const name = row.name.trim();

    if (name === "") {
      errors.set(row.id, "Enter a name.");
      continue;
    }

    const duplicate = seen.has(rowKey(kind, name));

    seen.add(rowKey(kind, name));

    if (duplicate) {
      errors.set(row.id, "Use each name only once.");
      continue;
    }

    const nameError = mcpSecretNameError(label, name);

    if (nameError !== "") {
      errors.set(row.id, nameError);
      continue;
    }

    if (
      (row.savedName === null || row.savedName !== name) &&
      row.value === ""
    ) {
      errors.set(row.id, "Enter a value, or remove this row.");
    }
  }

  return errors;
}

export function secretRowsError(
  kind: SecretKind,
  rows: Array<SecretRow>,
): string {
  for (const message of secretRowErrors(kind, rows).values()) {
    return message;
  }

  return "";
}

export function buildSecretPatch(
  initial: Array<string>,
  rows: Array<SecretRow>,
): McpSecretPatch {
  const patch: McpSecretPatch = {};

  for (const saved of initial) {
    if (!rows.some((row) => row.savedName === saved)) {
      patch[saved] = null;
    }
  }

  for (const row of rows) {
    const trimmed = row.name.trim();

    if (row.savedName !== null && row.savedName !== trimmed) {
      patch[row.savedName] = null;
    }

    if (
      row.savedName !== null &&
      row.savedName === trimmed &&
      row.value === ""
    ) {
      continue;
    }

    patch[trimmed] = row.value;
  }

  return patch;
}
