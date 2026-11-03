import { serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { HealthResponse } from "@veykor/shared/health";
import { db } from "./db/client.js";

const app = new Hono();

app.get("/api/health", async (context) => {
  await db.all(sql`select 1`);

  const response: HealthResponse = {
    status: "ok",
    service: "veykor-api",
    database: "connected",
  };

  return context.json(response);
});

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3001),
});
