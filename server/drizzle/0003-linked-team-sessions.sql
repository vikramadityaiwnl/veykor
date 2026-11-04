ALTER TABLE chats ADD COLUMN parent_chat_id TEXT NOT NULL DEFAULT '';
ALTER TABLE chats ADD COLUMN delegated_by_id TEXT NOT NULL DEFAULT '';
ALTER TABLE chats ADD COLUMN team_token TEXT NOT NULL DEFAULT '';
ALTER TABLE chats ADD COLUMN task TEXT NOT NULL DEFAULT '';
ALTER TABLE chats ADD COLUMN team_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE chats ADD COLUMN team_error TEXT NOT NULL DEFAULT '';
CREATE INDEX chats_parent_idx ON chats(parent_chat_id);
CREATE TABLE team_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id TEXT NOT NULL DEFAULT '' REFERENCES chats(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL DEFAULT '',
  recipient_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX team_events_root_idx ON team_events(root_id, id);
CREATE TABLE team_jobs (
  id TEXT PRIMARY KEY,
  root_id TEXT NOT NULL DEFAULT '' REFERENCES chats(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL DEFAULT '' REFERENCES chats(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX team_jobs_status_idx ON team_jobs(status, created_at);
