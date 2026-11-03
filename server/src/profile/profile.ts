import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq, ne } from "drizzle-orm";
import { defaultTag, updateProfileValidationError } from "@veykor/shared";
import type { UpdateProfileRequest, UserProfile } from "@veykor/shared";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function profileOf(row: typeof users.$inferSelect): UserProfile {
  return {
    username: row.username ?? "",
    tag: row.tag ?? defaultTag,
    status: row.status ?? "",
  };
}

export const profileRoute = new Hono<AuthEnv>();

profileRoute.use("*", bodyLimit({ maxSize: 16 * 1024 }));

profileRoute.get("/", requireAuth, (c) => {
  const row = db
    .select()
    .from(users)
    .where(eq(users.id, c.get("user").id))
    .get();

  if (!row) {
    return c.json({ error: "Authentication required" }, 401);
  }

  return c.json(profileOf(row));
});

profileRoute.put("/", requireAuth, async (c) => {
  const body = (await readJson(c)) as Partial<UpdateProfileRequest> | undefined;

  const input: UpdateProfileRequest = {
    username: typeof body?.username === "string" ? body.username.trim() : "",
    tag: typeof body?.tag === "string" ? body.tag.trim() : "",
    status: typeof body?.status === "string" ? body.status.trim() : "",
  };

  const validationError = updateProfileValidationError(input);

  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const userId = c.get("user").id;

  const taken = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, input.username), ne(users.id, userId)))
    .get();

  if (taken) {
    return c.json({ error: "Username is already taken" }, 409);
  }

  const updated = db
    .update(users)
    .set({ username: input.username, tag: input.tag, status: input.status })
    .where(eq(users.id, userId))
    .returning()
    .get();

  if (!updated) {
    return c.json({ error: "Authentication required" }, 401);
  }

  return c.json(profileOf(updated));
});
