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
