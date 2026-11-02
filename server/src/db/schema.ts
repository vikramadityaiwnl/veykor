import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  photo: text("photo"),
  theme: text("theme").notNull().default("dark"),
  chatDefaults: text("chat_defaults").notNull().default("{}"),
  transcriptionDefaults: text("transcription_defaults").notNull().default("{}"),
  transcriptionApiKey: text("transcription_api_key").notNull().default(""),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});

export const loginLimits = sqliteTable("login_limits", {
  id: integer("id").primaryKey(),
  attempts: integer("attempts").notNull(),
  resetAt: integer("reset_at").notNull(),
});

export const sidebarSections = sqliteTable("sidebar_sections", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull().default(""),
  kind: text("kind").notNull().default("custom"),
  position: integer("position").notNull().default(0),
  isExpanded: integer("is_expanded").notNull().default(1),
  isFixed: integer("is_fixed").notNull().default(0),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull().default(""),
  folder: text("folder").notNull().default(""),
  position: integer("position").notNull().default(0),
  sectionId: text("section_id"),
});

export const chatHistories = sqliteTable("chat_histories", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id),
  sessions: text("sessions").notNull().default("[]"),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  data: text("data").notNull().default("{}"),
  queuePaused: integer("queue_paused").notNull().default(0),
});

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull().default(""),
  transport: text("transport").notNull().default("stdio"),
  command: text("command").notNull().default(""),
  args: text("args").notNull().default("[]"),
  env: text("env").notNull().default("{}"),
  url: text("url").notNull().default(""),
  headers: text("headers").notNull().default("{}"),
  enabled: integer("enabled").notNull().default(1),
  status: text("status").notNull().default("unknown"),
  lastError: text("last_error").notNull().default(""),
  toolCount: integer("tool_count").notNull().default(0),
  lastChecked: integer("last_checked").notNull().default(0),
  createdAt: integer("created_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  providerId: text("provider_id").notNull().default("muse"),
  modelId: text("model_id").notNull().default(""),
  reasoningEffort: text("reasoning_effort").notNull().default(""),
  permissionMode: text("permission_mode").notNull().default("promptUnmatched"),
  projectIds: text("project_ids").notNull().default("[]"),
  toolsMode: text("tools_mode").notNull().default("unrestricted"),
  allowedTools: text("allowed_tools").notNull().default("[]"),
  skillsMode: text("skills_mode").notNull().default("unrestricted"),
  skillIds: text("skill_ids").notNull().default("[]"),
  mcpMode: text("mcp_mode").notNull().default("unrestricted"),
  mcpServerIds: text("mcp_server_ids").notNull().default("[]"),
  createdAt: integer("created_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const chatInputs = sqliteTable(
  "chat_inputs",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .default(0)
      .references(() => users.id),
    conversationId: text("conversation_id")
      .notNull()
      .default("")
      .references(() => conversations.id, { onDelete: "cascade" }),
    clientMessageId: text("client_message_id").notNull().default(""),
    payload: text("payload").notNull().default("{}"),
    state: text("state").notNull().default("queued"),
    error: text("error").notNull().default(""),
    errorKind: text("error_kind").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at").notNull().default(0),
  },
  (table) => [
    uniqueIndex("chat_inputs_submission").on(
      table.userId,
      table.conversationId,
      table.clientMessageId,
    ),
    index("chat_inputs_queue").on(
      table.state,
      table.conversationId,
      table.position,
    ),
  ],
);
