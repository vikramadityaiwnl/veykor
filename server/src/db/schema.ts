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
