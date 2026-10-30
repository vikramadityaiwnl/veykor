import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const visits = sqliteTable("visits", {
  id: integer("id").primaryKey(),
  count: integer("count").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type Visit = typeof visits.$inferSelect;
