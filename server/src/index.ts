import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { dbPath, runMigrations } from "./db/client.js";
import { healthRoute } from "./routes/health.js";

runMigrations();

const app = new Hono();

app.route("/api/health", healthRoute);

app.notFound((c) => c.json({ error: "Not found" }, 404));

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Veykor API listening on http://localhost:${info.port}`);
  console.log(`SQLite database: ${dbPath}`);
});

export type AppType = typeof app;
