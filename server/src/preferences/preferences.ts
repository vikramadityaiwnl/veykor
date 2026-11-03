import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { eq } from "drizzle-orm";
import { sanitizePreferences } from "@veykor/shared";
import type { UserPreferences } from "@veykor/shared";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import { db } from "../db/client.js";
import { preferences } from "../db/schema.js";

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function readStoredPreferences(userId: number): UserPreferences {
  const row = db
    .select()
    .from(preferences)
    .where(eq(preferences.userId, userId))
    .get();

  let parsed: unknown;

  if (row) {
    try {
      parsed = JSON.parse(row.data ?? "{}");
    } catch {
      parsed = undefined;
    }
  }

  return sanitizePreferences(parsed);
}

export const preferencesRoute = new Hono<AuthEnv>();

preferencesRoute.use("*", bodyLimit({ maxSize: 64 * 1024 }));

preferencesRoute.get("/", requireAuth, (c) => {
  return c.json(readStoredPreferences(c.get("user").id));
});

preferencesRoute.put("/", requireAuth, async (c) => {
  const stored = sanitizePreferences(await readJson(c));
  const data = JSON.stringify(stored);
  const updatedAt = new Date().toISOString();
  const userId = c.get("user").id;

  db.insert(preferences)
    .values({ userId, data, updatedAt })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: { data, updatedAt },
    })
    .run();

  return c.json(stored);
});
