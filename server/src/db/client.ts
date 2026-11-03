import Database from "better-sqlite3";
import { resolveDbPath } from "./path.js";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, "..", "..");

export const dbPath = resolveDbPath();

mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");

export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, {
  schema,
});

export function runMigrations(): void {
  migrate(db, { migrationsFolder: resolve(serverRoot, "drizzle") });
}

export function closeDb(): void {
  sqlite.close();
}
