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
import { mcpRoute } from "./routes/mcp.js";
import { integrationsRoute } from "./routes/integrations.js";
import { statusRoute } from "./routes/status.js";
import { closeChatProviders } from "./providers/index.js";
import { migrateStoredConversations } from "./chat/conversations.js";
import { startMessageQueue, stopMessageQueue } from "./chat/message-queue.js";
import { chatRoute } from "./routes/chat.js";
import { agentsRoute } from "./routes/agents.js";
import { collabRoute } from "./collab/routes.js";
import { collabMcpEntry } from "./collab/mcp-inject.js";
import { verifyMcpEntry } from "./collab/mcp-verify.js";
import { startCollabSweeper, stopCollabSweeper } from "./collab/sweeper.js";
import { handleTranscribeUpgrade, isTranscribeUpgrade } from "./transcribe/live.js";

runMigrations();
await migrateStoredConversations();
startMessageQueue();
startCollabSweeper();

{
  const entry = collabMcpEntry(1, "__veykor_probe__", {
    id: "__veykor_probe__",
    title: "probe",
    projectId: "probe",
    sectionId: null,
    providerId: "muse",
    modelId: "",
    nativeSessionId: "",
    permissionMode: "promptUnmatched",
    attachments: [],
  });

  if (!entry) {
    console.warn("Collaboration MCP bridge unavailable: no runnable entry");
  } else {
    verifyMcpEntry(entry)
      .then((result) => {
        if (!result.ok) {
          console.warn(`Collaboration MCP bridge failed: ${result.error}`);
        }
      })
      .catch((error) => {
        console.warn("Collaboration MCP probe failed", error);
      });
  }
}

const app = new Hono<AuthEnv>();

app.use("/api/*", csrfProtection);

app.route("/api/auth", authRoute);

app.route("/api/configuration", configurationRoute);

app.route("/api/sidebar", sidebarRoute);

app.route("/api/projects", projectsRoute);

app.route("/api/settings", settingsRoute);

app.route("/api/mcp", mcpRoute);

app.route("/api/integrations", integrationsRoute);

app.route("/api/status", statusRoute);

app.route("/api/chat", chatRoute);

app.route("/api/chat/collab", collabRoute);

app.route("/api/agents", agentsRoute);

app.get("/api/me", requireAuth, (c) => c.json({ user: c.get("user") }));

app.route("/api/health", healthRoute);

app.notFound((c) => c.json({ error: "Not found" }, 404));

const server = serve(
  { fetch: app.fetch, port, hostname: "0.0.0.0" },
  (info) => {
    console.log(`veykor API listening on http://localhost:${info.port}`);
    console.log(`SQLite database: ${dbPath}`);
  },
);

server.on("upgrade", (request, socket, head) => {
  if (isTranscribeUpgrade(request)) {
    handleTranscribeUpgrade(request, socket, head);
  } else {
    socket.destroy();
  }
});

export type AppType = typeof app;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopMessageQueue();
    stopCollabSweeper();
    void closeChatProviders().finally(() => process.exit(0));
  });
}
