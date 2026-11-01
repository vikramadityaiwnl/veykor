import { authRoute, csrfProtection, requireAuth, type AuthEnv } from "./auth/auth.js";
import { port } from "./auth/config.js";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { dbPath, runMigrations } from "./db/client.js";
import { healthRoute } from "./routes/health.js";
import { configurationRoute } from "./routes/configuration.js";
import { sidebarRoute } from "./routes/sidebar.js";
import { projectsRoute } from "./routes/projects.js";
import { settingsRoute } from "./routes/settings.js";
import { statusRoute } from "./routes/status.js";
import { chatProvider } from "./chat/chat-runner.js";
import { migrateStoredConversations } from "./chat/conversations.js";
import { chatRoute } from "./routes/chat.js";

runMigrations();
await migrateStoredConversations();

const app = new Hono<AuthEnv>();

app.use("/api/*", csrfProtection);

app.route("/api/auth", authRoute);

app.route("/api/configuration", configurationRoute);

app.route("/api/sidebar", sidebarRoute);

app.route("/api/projects", projectsRoute);

app.route("/api/settings", settingsRoute);

app.route("/api/status", statusRoute);

app.route("/api/chat", chatRoute);

app.get("/api/me", requireAuth, (c) => c.json({ user: c.get("user") }));

app.route("/api/health", healthRoute);

app.notFound((c) => c.json({ error: "Not found" }, 404));

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`veykor API listening on http://localhost:${info.port}`);
  console.log(`SQLite database: ${dbPath}`);
});

export type AppType = typeof app;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void chatProvider.close().finally(() => process.exit(0));
  });
}
