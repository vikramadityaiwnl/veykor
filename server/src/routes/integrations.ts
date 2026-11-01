import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { scanDetectedSkills } from "../skills/detect.js";

export const integrationsRoute = new Hono<AuthEnv>();

integrationsRoute.use("*", requireAuth);

integrationsRoute.get("/skills", (c) =>
  c.json({ sources: scanDetectedSkills() }),
);
