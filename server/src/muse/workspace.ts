import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { databasePath } from "../db/client.js";

export function workspaceFor(userId: number): string {
  const root = resolve(dirname(databasePath), "workspaces", String(userId));

  mkdirSync(root, { recursive: true });

  return root;
}
