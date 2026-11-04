import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique().default(""),
  passwordHash: text("password_hash").notNull().default(""),
  tag: text("tag").notNull().default("Building"),
  status: text("status").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .default(0)
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull().default(0),
  createdAt: text("created_at").notNull().default(""),
});

export const preferences = sqliteTable("preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: text("data").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(""),
});

export const chats = sqliteTable("chats", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .default(0)
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled chat"),
  sectionId: text("section_id").notNull().default("recent"),
  projectId: text("project_id").notNull().default(""),
  parentChatId: text("parent_chat_id").notNull().default(""),
  delegatedById: text("delegated_by_id").notNull().default(""),
  teamToken: text("team_token").notNull().default(""),
  task: text("task").notNull().default(""),
  teamStatus: text("team_status").notNull().default("idle"),
  teamError: text("team_error").notNull().default(""),
  todos: text("todos").notNull().default("[]"),
  nativeTodoSnapshot: text("native_todo_snapshot").notNull().default(""),
  agentSnapshot: text("agent_snapshot").notNull().default("{}"),
  agentContext: text("agent_context").notNull().default(""),
  mcpSnapshot: text("mcp_snapshot").notNull().default("[]"),
  museSessionId: text("muse_session_id").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .default(0)
    .references(() => users.id, { onDelete: "cascade" }),
  data: text("data").notNull().default("{}"),
});

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .default(0)
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  transport: text("transport").notNull().default("stdio"),
  config: text("config").notNull().default("{}"),
  enabled: integer("enabled").notNull().default(1),
  mode: text("mode").notNull().default("required"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .default(0)
    .references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().default(""),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  enabled: integer("enabled").notNull().default(1),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .default(0)
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  folder: text("folder").notNull().default(""),
  sectionId: text("section_id").notNull().default("default-projects"),
  agentIds: text("agent_ids").notNull().default("[]"),
});

export const teamEvents = sqliteTable("team_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rootId: text("root_id")
    .notNull()
    .default("")
    .references(() => chats.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().default(""),
  recipientId: text("recipient_id").notNull().default(""),
  kind: text("kind").notNull().default(""),
  text: text("text").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
});

export const teamJobs = sqliteTable("team_jobs", {
  id: text("id").primaryKey(),
  rootId: text("root_id")
    .notNull()
    .default("")
    .references(() => chats.id, { onDelete: "cascade" }),
  targetId: text("target_id")
    .notNull()
    .default("")
    .references(() => chats.id, { onDelete: "cascade" }),
  text: text("text").notNull().default(""),
  images: text("images").notNull().default("[]"),
  userVisible: integer("user_visible").notNull().default(0),
  status: text("status").notNull().default("pending"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(""),
});
