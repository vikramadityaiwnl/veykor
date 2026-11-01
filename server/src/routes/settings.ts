import type { GeneralPreferences } from "@veykor/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { getSettings } from "../settings/settings.js";

export const settingsRoute = new Hono<AuthEnv>();

settingsRoute.use("*", requireAuth);

settingsRoute.get("/", async (c) => c.json(await getSettings(true)));

settingsRoute.get("/general", (c) => {
  const user = db
    .select({ theme: users.theme })
    .from(users)
    .where(eq(users.id, c.get("user").id))
    .get()!;
  const response: GeneralPreferences = {
    theme: user.theme === "light" ? "light" : "dark",
  };

  return c.json(response);
});

settingsRoute.put("/general", async (c) => {
  let input: GeneralPreferences;

  try {
    input = await c.req.json<GeneralPreferences>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!input || !["light", "dark"].includes(input.theme)) {
    return c.json({ error: "Choose a light or dark theme." }, 400);
  }

  db.update(users)
    .set({ theme: input.theme })
    .where(eq(users.id, c.get("user").id))
    .run();

  return c.json({ theme: input.theme } satisfies GeneralPreferences);
});
