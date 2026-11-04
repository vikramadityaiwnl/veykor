import { serve } from "@hono/node-server";
import { Server } from "node:http";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import type { CurrentUserResponse, HealthResponse } from "@veykor/shared";
import { authRoute, csrfProtection, requireAuth } from "./auth/auth.js";
import type { AuthEnv } from "./auth/auth.js";
import { loadServerConfig } from "./auth/config.js";
import { chatRoute, modelRoute } from "./chats/chats.js";
import { db } from "./db/client.js";
import { integrationsRoute } from "./integrations/integrations.js";
import { skillsRoute } from "./integrations/skills.js";
import { memoryRoute } from "./memory/memories.js";
import { preferencesRoute } from "./preferences/preferences.js";
import { profileRoute } from "./profile/profile.js";
import {
  handleTranscriptionUpgrade,
  isTranscriptionUpgradePath,
  transcriptionMaxPayloadBytes,
} from "./transcription/transcription-upgrade.js";
import { agentRoute, projectRoute } from "./work/work.js";
import { teamRoute, teamMcpRoute } from "./teams/teams.js";
import { questionRoute } from "./questions/questions.js";
import { startTeamRuntime } from "./teams/team-runtime.js";

const config = loadServerConfig();

const app = new Hono<AuthEnv>();

app.use("/api/*", csrfProtection);

app.route("/api/auth", authRoute);
app.route("/api/chats", chatRoute);
app.route("/api/chats", questionRoute);
app.route("/api/teams", teamRoute);
app.route("/api/team-mcp", teamMcpRoute);
app.route("/api/agents", agentRoute);
app.route("/api/projects", projectRoute);
app.route("/api/models", modelRoute);
app.route("/api/preferences", preferencesRoute);
app.route("/api/profile", profileRoute);
app.route("/api/integrations", integrationsRoute);
app.route("/api/integrations/skills", skillsRoute);
app.route("/api/memories", memoryRoute);

app.get("/api/health", async (context) => {
  await db.all(sql`select 1`);

  const response: HealthResponse = {
    status: "ok",
    service: "veykor-api",
    database: "connected",
  };

  return context.json(response);
});

app.get("/api/me", requireAuth, (context) => {
  const response: CurrentUserResponse = {
    user: context.get("user"),
    expiresAt: context.get("expiresAt"),
  };

  return context.json(response);
});

app.notFound((context) => context.json({ error: "Not found" }, 404));

startTeamRuntime();

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: "0.0.0.0",
  },
  (info) => {
    console.log(`veykor API listening on http://0.0.0.0:${info.port}`);
    console.log(`SQLite database: ${config.databaseUrl}`);
  },
);

if (server instanceof Server) {
  server.requestTimeout = 0;
}

const transcriptionSockets = new WebSocketServer({
  noServer: true,
  maxPayload: transcriptionMaxPayloadBytes,
});

server.on("upgrade", (req, socket, head) => {
  if (!isTranscriptionUpgradePath(req.url)) {
    socket.destroy();

    return;
  }

  handleTranscriptionUpgrade(req, socket, head, transcriptionSockets);
});

server.on("error", (cause: NodeJS.ErrnoException) => {
  if (cause.code === "EADDRINUSE") {
    console.error(
      `Port ${config.port} is already in use by another process. Stop it and retry.`,
    );
    process.exit(1);
  }

  throw cause;
});
