import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  photo: text("photo"),
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
