import { randomBytes } from "node:crypto";
import { isHostRequest } from "./host-access.js";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { bodyLimit } from "hono/body-limit";
import { hash, verify as verifyPassword, argon2id } from "argon2";
import { and, eq, gt, lte } from "drizzle-orm";
import type { AuthUser, AuthCredentials } from "@veykor/shared";
import { db } from "../db/client.js";
import { users, sessions, loginLimits } from "../db/schema.js";
import { insertDefaultSidebarSections } from "../db/sidebar-sections.js";
import { authConfig } from "./config.js";

export type AuthEnv = {
  Variables: { user: AuthUser; sessionId: string; expiresAt: number };
};

const cookie = "veykor_session";

const options = {
  httpOnly: true,
  sameSite: "Strict" as const,
  secure: authConfig.secure,
  path: "/",
};

const now = () => Math.floor(Date.now() / 1000);

const publicUser = (user: typeof users.$inferSelect): AuthUser => ({
  id: user.id,
  username: user.username,
  photo: user.photo,
});

export const csrfProtection = createMiddleware(async (c, next) => {
  c.header("Cache-Control", "no-store");

  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    const sameOrigin = origin === new URL(c.req.url).origin;

    if (
      !origin ||
      (!sameOrigin && !authConfig.origins.includes(origin)) ||
      c.req.header("X-Veykor-Request") !== "1" ||
      c.req.header("Sec-Fetch-Site") === "cross-site"
    ) {
      return c.json({ error: "Invalid request origin" }, 403);
    }
  }

  await next();
});

async function authenticate(c: Context<AuthEnv>): Promise<boolean> {
  try {
    const token = getCookie(c, cookie);

    if (!token) {
      return false;
    }

    const payload = await verify(token, authConfig.secret, "HS256");

    if (
      payload.iss !== "veykor" ||
      typeof payload.jti !== "string" ||
      typeof payload.sub !== "string"
    ) {
      return false;
    }

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, payload.jti), gt(sessions.expiresAt, now())))
      .get();

    if (!session || String(session.userId) !== payload.sub) {
      return false;
    }

    const user = db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .get();

    if (!user) {
      return false;
    }

    c.set("user", publicUser(user));
    c.set("sessionId", session.id);
    c.set("expiresAt", session.expiresAt);

    return true;
  } catch {
    return false;
  }
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  if (!(await authenticate(c))) {
    deleteCookie(c, cookie, options);

    return c.json({ error: "Authentication required" }, 401);
  }

  await next();
});

async function startSession(
  c: Context<AuthEnv>,
  user: typeof users.$inferSelect,
) {
  const expiresAt = now() + authConfig.lifetime;
  const id = randomBytes(32).toString("hex");
  const token = await sign(
    {
      sub: String(user.id),
      jti: id,
      iss: "veykor",
      iat: now(),
      exp: expiresAt,
    },
    authConfig.secret,
    "HS256",
  );

  db.delete(sessions).where(lte(sessions.expiresAt, now())).run();
  db.insert(sessions).values({ id, userId: user.id, expiresAt }).run();

  setCookie(c, cookie, token, { ...options, maxAge: authConfig.lifetime });

  return c.json({
    user: publicUser(user),
    registrationAllowed: isHostRequest(c),
    expiresAt,
  });
}

function limited(): boolean {
  return db.transaction((tx) => {
    const entry = tx
      .select()
      .from(loginLimits)
      .where(eq(loginLimits.id, 1))
      .get();

    if (!entry || entry.resetAt <= now()) {
      tx.insert(loginLimits)
        .values({ id: 1, attempts: 1, resetAt: now() + 900 })
        .onConflictDoUpdate({
          target: loginLimits.id,
          set: { attempts: 1, resetAt: now() + 900 },
        })
        .run();

      return false;
    }

    if (entry.attempts >= 10) {
      return true;
    }

    tx.update(loginLimits)
      .set({ attempts: entry.attempts + 1 })
      .where(eq(loginLimits.id, 1))
      .run();

    return false;
  });
}

export const authRoute = new Hono<AuthEnv>();

authRoute.use("*", bodyLimit({ maxSize: 400_000 }));

authRoute.get("/status", async (c) => {
  const authenticated = await authenticate(c);

  if (!authenticated && getCookie(c, cookie)) {
    deleteCookie(c, cookie, options);
  }

  return c.json({
    user: authenticated ? c.get("user") : null,
    expiresAt: authenticated ? c.get("expiresAt") : null,
    registrationAllowed: isHostRequest(c),
  });
});

for (const action of ["register", "login"] as const) {
  authRoute.post("/" + action, async (c) => {
    if (action === "register" && !isHostRequest(c)) {
      return c.json(
        { error: "Account creation is available only on localhost" },
        403,
      );
    }

    if (limited()) {
      c.header("Retry-After", "900");

      return c.json(
        { error: "Too many attempts. Try again in 15 minutes." },
        429,
      );
    }

    let input: AuthCredentials;

    try {
      input = await c.req.json<AuthCredentials>();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (
      !input ||
      typeof input.username !== "string" ||
      !/^[a-zA-Z0-9_.-]{3,64}$/.test(input.username) ||
      typeof input.password !== "string" ||
      input.password.length > 256 ||
      input.password.length < (action === "register" ? 8 : 1)
    ) {
      return c.json(
        {
          error:
            "Use a 3–64 character username and an 8–256 character password.",
        },
        400,
      );
    }

    if (action === "register") {
      if (
        input.photo !== undefined &&
        (typeof input.photo !== "string" ||
          input.photo.length > 350_000 ||
          !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(
            input.photo,
          ))
      ) {
        return c.json(
          { error: "Use a PNG, JPEG, or WebP photo under 250 KB." },
          400,
        );
      }

      const passwordHash = await hash(input.password, {
        type: argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
      const user = db
        .insert(users)
        .values({
          username: input.username,
          passwordHash,
          photo: input.photo ?? null,
        })
        .onConflictDoNothing()
        .returning()
        .get();

      if (!user) {
        return c.json({ error: "Username is already taken" }, 409);
      }

      insertDefaultSidebarSections(user.id);

      return startSession(c, user);
    }

    const user = db
      .select()
      .from(users)
      .where(eq(users.username, input.username))
      .get();

    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      return c.json({ error: "Invalid username or password" }, 401);
    }

    return startSession(c, user);
  });
}

authRoute.post("/logout", requireAuth, (c) => {
  db.delete(sessions)
    .where(eq(sessions.id, c.get("sessionId")))
    .run();
  deleteCookie(c, cookie, options);

  return c.json({ ok: true });
});
