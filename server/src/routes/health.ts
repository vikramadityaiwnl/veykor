import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { HealthResponse } from "@veykor/shared";
import { db } from "../db/client.js";

export const healthRoute = new Hono().get("/", (c) => {
  try {
    db.run(sql`SELECT 1`);
  } catch {
    const response: HealthResponse = {
      status: "degraded",
      db: "disconnected",
    };

    return c.json(response, 503);
  }

  const response: HealthResponse = { status: "ok", db: "connected" };

  return c.json(response);
});
