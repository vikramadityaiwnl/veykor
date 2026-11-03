import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { and, eq, gt, lte } from "drizzle-orm";
import {
  changePasswordValidationError,
  defaultAuthStatus,
  loginValidationError,
  registerValidationError,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type {
  AuthStatus,
  AuthUser,
  ChangePasswordRequest,
  ChangePasswordResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
} from "@veykor/shared";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { isHostRequest } from "./host-access.js";
import { hashPassword, verifyPassword } from "./password.js";

export interface AuthVariables {
  user: AuthUser;
  sessionId: string;
  expiresAt: number;
}

export type AuthEnv = {
  Variables: AuthVariables;
};

const sessionCookie = "veykor_session";

const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

const cookieOptions = {
  httpOnly: true,
  sameSite: "Lax" as const,
  secure: false,
  path: "/",
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function publicUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    username: row.username ?? "",
  };
}

export const csrfProtection = createMiddleware(async (c, next) => {
  c.header("Cache-Control", "no-store");

  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const marker = c.req.header(veykorRequestHeaderName);

    if (marker !== veykorRequestHeaderValue) {
      return c.json({ error: "Invalid request origin" }, 403);
    }
  }

  await next();
});

async function authenticate(c: Context<AuthEnv>): Promise<boolean> {
  try {
    const token = getCookie(c, sessionCookie);

    if (!token) {
      return false;
    }

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, token), gt(sessions.expiresAt, nowSeconds())))
      .get();

    if (!session) {
      return false;
    }

    const row = db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .get();

    if (!row) {
      return false;
    }

    c.set("user", publicUser(row));
    c.set("sessionId", session.id);
    c.set("expiresAt", session.expiresAt);

    return true;
  } catch {
    return false;
  }
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  if (!(await authenticate(c))) {
    deleteCookie(c, sessionCookie, cookieOptions);

    return c.json({ error: "Authentication required" }, 401);
  }

  await next();
});

async function startSession(
  c: Context<AuthEnv>,
  row: typeof users.$inferSelect,
  status: 200 | 201,
) {
  const expiresAt = nowSeconds() + sessionLifetimeSeconds;
  const id = randomBytes(32).toString("hex");

  db.delete(sessions).where(lte(sessions.expiresAt, nowSeconds())).run();

  db.insert(sessions)
    .values({
      id,
      userId: row.id,
      expiresAt,
      createdAt: new Date().toISOString(),
    })
    .run();

  setCookie(c, sessionCookie, id, {
    ...cookieOptions,
    maxAge: sessionLifetimeSeconds,
  });

  const response: LoginResponse = {
    user: publicUser(row),
    expiresAt,
  };

  return c.json(response, status);
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export const authRoute = new Hono<AuthEnv>();

authRoute.use("*", bodyLimit({ maxSize: 16 * 1024 }));

authRoute.get("/status", async (c) => {
  const authenticated = await authenticate(c);

  if (!authenticated && getCookie(c, sessionCookie)) {
    deleteCookie(c, sessionCookie, cookieOptions);
  }

  const response: AuthStatus = authenticated
    ? {
        authenticated: true,
        user: c.get("user"),
        registrationAllowed: isHostRequest(c),
        expiresAt: c.get("expiresAt"),
      }
    : defaultAuthStatus(isHostRequest(c));

  return c.json(response);
});

authRoute.post("/login", async (c) => {
  const body = (await readJson(c)) as Partial<LoginRequest> | undefined;

  const input: LoginRequest = {
    username: typeof body?.username === "string" ? body.username : "",
    password: typeof body?.password === "string" ? body.password : "",
  };

  const validationError = loginValidationError(input);

  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const row = db
    .select()
    .from(users)
    .where(eq(users.username, input.username))
    .get();

  if (!row || !(await verifyPassword(input.password, row.passwordHash ?? ""))) {
    return c.json({ error: "Invalid username or password" }, 401);
  }

  return startSession(c, row, 200);
});

authRoute.post("/change-password", requireAuth, async (c) => {
  const body = (await readJson(c)) as
    Partial<ChangePasswordRequest> | undefined;

  const input: ChangePasswordRequest = {
    currentPassword:
      typeof body?.currentPassword === "string" ? body.currentPassword : "",
    newPassword: typeof body?.newPassword === "string" ? body.newPassword : "",
  };

  const validationError = changePasswordValidationError(input);

  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const row = db
    .select()
    .from(users)
    .where(eq(users.id, c.get("user").id))
    .get();

  if (
    !row ||
    !(await verifyPassword(input.currentPassword, row.passwordHash ?? ""))
  ) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  db.update(users)
    .set({ passwordHash: await hashPassword(input.newPassword) })
    .where(eq(users.id, row.id))
    .run();

  const response: ChangePasswordResponse = { changed: true };

  return c.json(response);
});

authRoute.post("/logout", requireAuth, (c) => {
  db.delete(sessions)
    .where(eq(sessions.id, c.get("sessionId")))
    .run();

  deleteCookie(c, sessionCookie, cookieOptions);

  return c.json(defaultAuthStatus(isHostRequest(c)));
});

authRoute.post("/register", async (c) => {
  if (!isHostRequest(c)) {
    return c.json(
      { error: "Account creation is available only on the host machine" },
      403,
    );
  }

  const body = (await readJson(c)) as Partial<RegisterRequest> | undefined;

  const input: RegisterRequest = {
    username: typeof body?.username === "string" ? body.username : "",
    password: typeof body?.password === "string" ? body.password : "",
  };

  const validationError = registerValidationError(input);

  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const passwordHash = await hashPassword(input.password);

  const row = db
    .insert(users)
    .values({
      username: input.username,
      passwordHash,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning()
    .get();

  if (!row) {
    return c.json({ error: "Username is already taken" }, 409);
  }

  return startSession(c, row, 201);
});
