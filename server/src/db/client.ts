import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { loadDatabaseUrl } from "../auth/config.js";
import { runMigrations } from "./migrate.js";

export const databasePath = loadDatabaseUrl();

mkdirSync(dirname(resolve(databasePath)), { recursive: true });

const sqlite = new Database(databasePath);

runMigrations(sqlite);

export const db = drizzle({ client: sqlite });
