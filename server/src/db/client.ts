import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";

const databasePath = process.env.DATABASE_URL ?? "./data/veykor.db";

mkdirSync(dirname(resolve(databasePath)), { recursive: true });

const sqlite = new Database(databasePath);

export const db = drizzle({ client: sqlite });
