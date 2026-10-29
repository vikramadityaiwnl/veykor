import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";

export const healthRoute = new Hono().get("/", (c) => {
  try {
    db.run(sql`SELECT 1`);
  } catch {
    return c.json({ status: "degraded", db: "disconnected" }, 503);
  }
  return c.json({ status: "ok", db: "connected" });
});
