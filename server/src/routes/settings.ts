import type { ChatDefaults, GeneralPreferences } from "@veykor/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { getSettings } from "../settings/settings.js";
import { parseChatDefaults, validChatDefaults } from "../settings/chat-defaults.js";

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

settingsRoute.get("/chat-defaults", (c) => {
  const user = db
    .select({ chatDefaults: users.chatDefaults })
    .from(users)
    .where(eq(users.id, c.get("user").id))
    .get()!;

  return c.json(parseChatDefaults(user.chatDefaults));
});

settingsRoute.put("/chat-defaults", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validChatDefaults(input)) {
    return c.json({ error: "Choose a supported provider and model." }, 400);
  }

  db.update(users)
    .set({
      chatDefaults: JSON.stringify({
        defaultProviderId: input.defaultProviderId,
        models: input.models,
        efforts: input.efforts,
        permissionMode: input.permissionMode,
      } satisfies ChatDefaults),
    })
    .where(eq(users.id, c.get("user").id))
    .run();

  return c.json(parseChatDefaults(input));
});
