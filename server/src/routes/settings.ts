import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { getSettings } from "../settings/settings.js";

export const settingsRoute = new Hono<AuthEnv>();

settingsRoute.use("*", requireAuth);

settingsRoute.get("/", async (c) => c.json(await getSettings(true)));
