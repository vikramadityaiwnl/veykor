import type { ChatDefaults, GeneralPreferences, TranscriptionDefaults } from "@veykor/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { getSettings } from "../settings/settings.js";
import { parseChatDefaults, validChatDefaults } from "../settings/chat-defaults.js";
import { getTranscriptionCatalog } from "../settings/transcription.js";
import { parseTranscriptionDefaults, validTranscriptionDefaults } from "../settings/transcription-defaults.js";
import { keyStatus, validTranscriptionKey } from "../settings/transcription-key.js";

export const settingsRoute = new Hono<AuthEnv>();

settingsRoute.use("*", requireAuth);

settingsRoute.get("/", async (c) =>
  c.json(await getSettings(c.req.query("refresh") === "true")),
);

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
        messageBehavior: input.messageBehavior || "queue",
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

settingsRoute.get("/transcription-catalog", (c) =>
  c.json(getTranscriptionCatalog(c.get("user").id)),
);

settingsRoute.get("/transcription-key", (c) => {
  const user = db
    .select({ transcriptionApiKey: users.transcriptionApiKey })
    .from(users)
    .where(eq(users.id, c.get("user").id))
    .get()!;

  return c.json(keyStatus(user.transcriptionApiKey));
});

settingsRoute.put("/transcription-key", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validTranscriptionKey(input)) {
    return c.json({ error: "Enter a valid Model API key." }, 400);
  }

  const key = input.key.trim();

  db.update(users)
    .set({ transcriptionApiKey: key })
    .where(eq(users.id, c.get("user").id))
    .run();

  return c.json(keyStatus(key));
});

settingsRoute.get("/transcription-defaults", (c) => {
  const user = db
    .select({ transcriptionDefaults: users.transcriptionDefaults })
    .from(users)
    .where(eq(users.id, c.get("user").id))
    .get()!;

  return c.json(parseTranscriptionDefaults(user.transcriptionDefaults));
});

settingsRoute.put("/transcription-defaults", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validTranscriptionDefaults(input)) {
    return c.json(
      { error: "Choose a supported transcription provider and model." },
      400,
    );
  }

  db.update(users)
    .set({
      transcriptionDefaults: JSON.stringify({
        providerId: input.providerId,
        modelId: input.modelId,
      } satisfies TranscriptionDefaults),
    })
    .where(eq(users.id, c.get("user").id))
    .run();

  return c.json(parseTranscriptionDefaults(input));
});
