import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique().default(""),
  passwordHash: text("password_hash").notNull().default(""),
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
