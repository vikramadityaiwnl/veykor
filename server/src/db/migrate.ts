import { compileAgentContext } from "../work/agent-context.js";
import {
  defaultAgentDefinitions,
  legacyDefaultInstructions,
} from "../work/default-agents.js";
import {
  sanitizePreferences,
  defaultProjectSectionId,
  defaultPreferences,
} from "@veykor/shared";
import { randomUUID } from "node:crypto";
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

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      transport TEXT NOT NULL DEFAULT 'stdio',
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      mode TEXT NOT NULL DEFAULT 'required',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS mcp_servers_user_name_idx ON mcp_servers(user_id, name);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS mcp_servers_user_idx ON mcp_servers(user_id);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS skills_user_slug_idx ON skills(user_id, slug);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS skills_user_idx ON skills(user_id);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE CASCADE,
      scope TEXT NOT NULL DEFAULT 'global',
      project_id TEXT NOT NULL DEFAULT '',
      instruction TEXT NOT NULL DEFAULT '',
      instruction_hash TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT 'manual',
      source_chat_id TEXT NOT NULL DEFAULT '',
      source_message_id TEXT NOT NULL DEFAULT '',
      source_excerpt TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS memories_user_idx ON memories(user_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS memories_user_scope_idx ON memories(user_id, scope, project_id);
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS memories_user_key_idx ON memories(user_id, idempotency_key) WHERE idempotency_key != '';
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS memories_user_dupe_idx ON memories(user_id, scope, project_id, instruction_hash) WHERE instruction_hash != '';
  `);

  for (const [name, value] of [
    ["project_id", ""],
    ["parent_chat_id", ""],
    ["delegated_by_id", ""],
    ["team_token", ""],
    ["task", ""],
    ["team_status", "idle"],
    ["team_error", ""],
    ["todos", "[]"],
    ["native_todo_snapshot", ""],
    ["agent_snapshot", "{}"],
    ["agent_context", ""],
    ["mcp_snapshot", "[]"],
  ]) {
    if (!chatColumns.some((column) => column.name === name)) {
      sqlite.exec(
        `ALTER TABLE chats ADD COLUMN ${name} TEXT NOT NULL DEFAULT '${value}'`,
      );
    }
  }
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS chats_parent_idx ON chats(parent_chat_id);
    CREATE TABLE IF NOT EXISTS team_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_id TEXT NOT NULL DEFAULT '' REFERENCES chats(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL DEFAULT '',
      recipient_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS team_events_root_idx ON team_events(root_id, id);
    CREATE TABLE IF NOT EXISTS team_jobs (
      id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL DEFAULT '' REFERENCES chats(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL DEFAULT '' REFERENCES chats(id) ON DELETE CASCADE,
      text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS team_jobs_status_idx ON team_jobs(status, created_at);
  `);

  const jobColumns = sqlite.prepare("PRAGMA table_info(team_jobs)").all() as {
    name: string;
  }[];

  if (!jobColumns.some((column) => column.name === "images")) {
    sqlite.exec(
      "ALTER TABLE team_jobs ADD COLUMN images TEXT NOT NULL DEFAULT '[]'",
    );
  }

  if (!jobColumns.some((column) => column.name === "user_visible")) {
    sqlite.exec(
      "ALTER TABLE team_jobs ADD COLUMN user_visible INTEGER NOT NULL DEFAULT 0",
    );
  }

  if (!jobColumns.some((column) => column.name === "sort_order")) {
    sqlite.exec(
      "ALTER TABLE team_jobs ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
    );
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS question_requests (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE CASCADE,
      root_id TEXT NOT NULL DEFAULT '' REFERENCES chats(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL DEFAULT '',
      agent_id TEXT NOT NULL DEFAULT '',
      agent_name TEXT NOT NULL DEFAULT '',
      muse_session_id TEXT NOT NULL DEFAULT '',
      turn_id TEXT NOT NULL DEFAULT '',
      call_key TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT NOT NULL DEFAULT '[]',
      answers TEXT NOT NULL DEFAULT '[]',
      notice TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      settled_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS question_requests_root_idx ON question_requests(root_id, status, created_at);
    CREATE INDEX IF NOT EXISTS question_requests_member_idx ON question_requests(member_id, status);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS generated_images (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE CASCADE,
      chat_id TEXT NOT NULL DEFAULT '' REFERENCES chats(id) ON DELETE CASCADE,
      root_id TEXT NOT NULL DEFAULT '',
      call_key TEXT NOT NULL DEFAULT '',
      turn_id TEXT NOT NULL DEFAULT '',
      tool_item_id TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'generating',
      error TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL DEFAULT '',
      byte_size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS generated_images_chat_idx ON generated_images(chat_id, created_at);
    CREATE INDEX IF NOT EXISTS generated_images_user_idx ON generated_images(user_id);
  `);

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

    const sanitized = sanitizePreferences(value);

    if (!sanitized.agentsSeeded) {
      const agentCount = (
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM agents WHERE user_id = ?")
          .get(row.user_id) as { count: number }
      ).count;

      if (agentCount === 0) {
        const insert = sqlite.prepare(
          "INSERT INTO agents (id, user_id, data) VALUES (?, ?, ?)",
        );

        for (const definition of defaultAgentDefinitions) {
          insert.run(randomUUID(), row.user_id, JSON.stringify(definition));
        }
      }

      sanitized.agentsSeeded = true;
    }

    sqlite
      .prepare("UPDATE preferences SET data = ? WHERE user_id = ?")
      .run(JSON.stringify(sanitized), row.user_id);
  }

  const storedAgents = sqlite
    .prepare("SELECT id, data FROM agents")
    .all() as Array<{ id: string; data: string }>;

  for (const row of storedAgents) {
    let data: Record<string, unknown>;

    try {
      const parsed: unknown = JSON.parse(row.data);

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        continue;
      }

      data = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const definition = defaultAgentDefinitions.find(
      (entry) => entry.name === data["name"],
    );

    if (!definition) {
      continue;
    }

    const legacyInstructions = legacyDefaultInstructions[definition.name] ?? [];
    const untouchedInstructions =
      data["instructions"] === definition.instructions ||
      legacyInstructions.some((entry) => entry === data["instructions"]);
    const stockModel =
      data["modelId"] === "" || data["modelId"] === definition.modelId;

    if (!untouchedInstructions || !stockModel) {
      continue;
    }

    sqlite.prepare("UPDATE agents SET data = ? WHERE id = ?").run(
      JSON.stringify({
        ...definition,
        autoAddToNewProjects: data["autoAddToNewProjects"] === true,
      }),
      row.id,
    );
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
  const legacyChats = sqlite
    .prepare(
      `SELECT chats.id, chats.agent_snapshot, COALESCE(projects.name, '') AS name, COALESCE(projects.folder, '') AS folder FROM chats LEFT JOIN projects ON projects.id = chats.project_id AND projects.user_id = chats.user_id WHERE chats.project_id != '' AND chats.agent_context = ''`,
    )
    .all() as {
    id: string;
    agent_snapshot: string;
    name: string;
    folder: string;
  }[];

  for (const chat of legacyChats) {
    let agent;

    try {
      agent = JSON.parse(chat.agent_snapshot);
    } catch {
      continue;
    }

    if (typeof agent !== "object" || agent === null || Array.isArray(agent)) {
      continue;
    }

    const context = compileAgentContext(agent, chat);
    sqlite
      .prepare("UPDATE chats SET agent_context = ? WHERE id = ?")
      .run(context, chat.id);
  }
}
