import {
  sanitizePreferences,
  defaultProjectSectionId,
  defaultPreferences,
} from "@veykor/shared";
import type Database from "better-sqlite3";

export function runMigrations(sqlite: Database.Database): void {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      tag TEXT NOT NULL DEFAULT 'Building',
      status TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
  `);

  const columns = sqlite.prepare("PRAGMA table_info(users)").all() as {
    name: string;
  }[];

  if (columns.some((column) => column.name === "is_host")) {
    sqlite.exec("ALTER TABLE users DROP COLUMN is_host");
  }

  if (!columns.some((column) => column.name === "tag")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN tag TEXT NOT NULL DEFAULT 'Building'",
    );
  }

  if (!columns.some((column) => column.name === "status")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT ''");
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Untitled chat',
      section_id TEXT NOT NULL DEFAULT 'recent',
      muse_session_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS chats_user_updated_idx ON chats(user_id, updated_at);
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      folder TEXT NOT NULL DEFAULT '',
      section_id TEXT NOT NULL DEFAULT 'default-projects',
      agent_ids TEXT NOT NULL DEFAULT '[]'
    );
  `);

  const chatColumns = sqlite.prepare("PRAGMA table_info(chats)").all() as {
    name: string;
  }[];

  for (const [name, value] of [
    ["project_id", ""],
    ["agent_snapshot", "{}"],
  ]) {
    if (!chatColumns.some((column) => column.name === name)) {
      sqlite.exec(
        `ALTER TABLE chats ADD COLUMN ${name} TEXT NOT NULL DEFAULT '${value}'`,
      );
    }
  }
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO preferences (user_id, data) SELECT id, ? FROM users",
    )
    .run(JSON.stringify(defaultPreferences()));

  const storedPreferences = sqlite
    .prepare("SELECT user_id, data FROM preferences")
    .all() as { user_id: number; data: string }[];

  for (const row of storedPreferences) {
    let value: unknown;

    try {
      value = JSON.parse(row.data);
    } catch {
      value = undefined;
    }

    sqlite
      .prepare("UPDATE preferences SET data = ? WHERE user_id = ?")
      .run(JSON.stringify(sanitizePreferences(value)), row.user_id);
  }

  sqlite
    .prepare(
      "UPDATE chats SET section_id = 'recent' WHERE section_id = 'chats' AND project_id = ''",
    )
    .run();
  sqlite
    .prepare(
      "UPDATE projects SET section_id = ? WHERE section_id IN ('recent', 'chats')",
    )
    .run(defaultProjectSectionId);
}
