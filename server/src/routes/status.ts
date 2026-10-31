import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { getSystemStatus } from "../status/status.js";

export const statusRoute = new Hono<AuthEnv>();

statusRoute.use("*", requireAuth);

statusRoute.get("/", async (c) => c.json(await getSystemStatus()));
