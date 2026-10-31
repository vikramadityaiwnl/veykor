import type { AuthStatus, ConfigurationUsersResponse } from "@veykor/shared";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { sign } from "hono/jwt";

test("multi-user auth, isolated sessions, persistence, CSRF, expiration and LAN policy", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-auth-"));
  const database = join(folder, "test.db");
  const port = "31987";
  const origin = `http://localhost:${port}`;
  const secret = "test-secret-only-with-at-least-thirty-two-bytes";
  let child: ChildProcess;

  async function start() {
    child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        JWT_SECRET: secret,
        PORT: port,
        DATABASE_URL: database,
        AUTH_COOKIE_SECURE: "false",
        AUTH_ORIGINS: origin + ",http://192.168.1.10:5173",
      },
      stdio: "pipe",
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Server startup timeout")),
        10000,
      );

      child.stdout!.on("data", (data) => {
        if (String(data).includes("listening")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.stderr!.on("data", (data) => {
        clearTimeout(timer);
        reject(new Error(String(data)));
      });
    });
  }

  async function stop() {
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
  }

  async function request(
    path: string,
    body?: unknown,
    cookie?: string,
    extra: Record<string, string> = {},
  ): Promise<
    Omit<Response, "json"> & {
      json: () => Promise<AuthStatus & ConfigurationUsersResponse>;
    }
  > {
    return fetch(
      (extra.Host ? "http://" + extra.Host : origin) + "/api/" + path,
      {
        ...(body !== undefined
          ? { method: "POST", body: JSON.stringify(body) }
          : {}),
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
          ...(cookie ? { Cookie: cookie } : {}),
          ...extra,
        },
      },
    ) as Promise<
      Omit<Response, "json"> & {
        json: () => Promise<AuthStatus & ConfigurationUsersResponse>;
      }
    >;
  }

  const credentials = { username: "alex", password: "a-strong-test-password" };

  try {
    await start();
    assert.equal((await request("me")).status, 401);
    assert.equal(
      (await (await request("auth/status")).json()).registrationAllowed,
      true,
    );
    assert.equal(
      (
        await request("auth/register", credentials, undefined, {
          Origin: "http://192.168.1.10:5173",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("auth/register", credentials, undefined, {
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );

    const setup = await request("auth/register", credentials);

    assert.equal(setup.status, 200);

    const cookie = setup.headers.get("set-cookie")!.split(";")[0];

    assert.match(setup.headers.get("set-cookie")!, /HttpOnly/i);
    assert.match(setup.headers.get("set-cookie")!, /SameSite=Strict/i);
    assert.equal((await request("auth/register", credentials)).status, 409);
    assert.equal(
      (await (await request("auth/status")).json()).registrationAllowed,
      true,
    );

    const firstUser = (await setup.json()).user as {
      id: number;
      username: string;
    };
    const otherCredentials = { username: "brother", password: "eight888" };
    const otherRegistration = await request("auth/register", otherCredentials);

    assert.equal(otherRegistration.status, 200);

    const otherUser = (await otherRegistration.json()).user as {
      id: number;
      username: string;
    };
    const otherCookie = otherRegistration.headers
      .get("set-cookie")!
      .split(";")[0];

    assert.equal((await request("configuration/users")).status, 401);

    const configuration = await request(
      "configuration/users",
      undefined,
      cookie,
    );

    assert.equal(configuration.status, 200);
    assert.equal(configuration.headers.get("cache-control"), "no-store");
    assert.deepEqual((await configuration.json()).users, [
      { id: firstUser.id, username: "alex", photo: null },
      { id: otherUser.id, username: "brother", photo: null },
    ]);

    const deniedHeaders: Record<string, string>[] = [
      { Origin: "http://192.168.1.10:5173" },
      { "X-Forwarded-For": "192.168.1.10" },
      { "Sec-Fetch-Site": "cross-site" },
    ];

    for (const headers of deniedHeaders) {
      const denied = await request(
        "configuration/users",
        undefined,
        undefined,
        headers,
      );

      assert.equal(denied.status, 403, JSON.stringify(headers));
      assert.equal((await denied.json()).users, undefined);
    }

    assert.notEqual(otherUser.id, firstUser.id);
    assert.equal(
      (await (await request("me", undefined, cookie)).json()).user!.username,
      "alex",
    );
    assert.equal(
      (await (await request("me", undefined, otherCookie)).json()).user!
        .username,
      "brother",
    );
    assert.equal(
      (
        await request("auth/register", {
          username: "short",
          password: "seven77",
        })
      ).status,
      400,
    );
    assert.equal((await request("me", undefined, cookie)).status, 200);
    assert.equal(
      (await request("auth/login", { ...credentials, password: "wrong" }))
        .status,
      401,
    );

    const login = await request("auth/login", credentials);

    assert.equal(login.status, 200);

    const secondCookie = login.headers.get("set-cookie")!.split(";")[0];

    assert.notEqual(secondCookie, cookie);

    const networkAddress = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .find((entry) => !entry.internal && entry.family === "IPv4")?.address;

    if (networkAddress) {
      const lanHeaders = {
        Origin: `http://${networkAddress}:${port}`,
        Host: `${networkAddress}:${port}`,
      };

      const lanLogin = await request(
        "auth/login",
        credentials,
        undefined,
        lanHeaders,
      );

      assert.equal(lanLogin.status, 200);
      assert.equal((await lanLogin.json()).registrationAllowed, false);

      const lanCookie = lanLogin.headers.get("set-cookie")!.split(";")[0];
      const lanStatus = await request(
        "auth/status",
        undefined,
        lanCookie,
        lanHeaders,
      );

      assert.equal((await lanStatus.json()).user!.username, "alex");
      assert.equal(
        (await request("auth/register", credentials, undefined, lanHeaders))
          .status,
        403,
      );
      assert.equal(
        (await request("configuration/users", undefined, lanCookie, lanHeaders))
          .status,
        403,
      );
      assert.equal(
        (await request("auth/logout", {}, lanCookie, lanHeaders)).status,
        200,
      );

      for (const headers of [
        { ...lanHeaders, Origin: "http://192.168.0.103:5174" },
        { ...lanHeaders, Origin: "https://evil.example" },
        { ...lanHeaders, "X-Veykor-Request": "" },
        { ...lanHeaders, "Sec-Fetch-Site": "cross-site" },
      ]) {
        assert.equal(
          (await request("auth/login", credentials, undefined, headers)).status,
          403,
        );
      }
    }

    await stop();
    await start();
    assert.equal((await request("me", undefined, cookie)).status, 200);
    assert.equal((await request("auth/logout", {}, cookie)).status, 200);
    assert.equal((await request("me", undefined, cookie)).status, 401);
    assert.equal((await request("me", undefined, secondCookie)).status, 200);
    assert.equal((await request("me", undefined, otherCookie)).status, 200);
    assert.equal(
      (await (await request("auth/status")).json()).registrationAllowed,
      true,
    );

    const sqlite = new Database(database);
    const user = sqlite.prepare("select * from users").get() as {
      password_hash: string;
    };

    assert.match(user.password_hash, /^\$argon2id\$/);

    const session = sqlite
      .prepare("select id from sessions where user_id = ?")
      .get(firstUser.id) as {
      id: string;
    };
    const expired = await sign(
      { sub: String(firstUser.id), jti: session.id, iss: "veykor", exp: 1 },
      secret,
      "HS256",
    );

    assert.equal(
      (await request("me", undefined, "veykor_session=" + expired)).status,
      401,
    );
    const mismatched = await sign(
      {
        sub: String(otherUser.id),
        jti: session.id,
        iss: "veykor",
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      secret,
      "HS256",
    );

    assert.equal(
      (await request("me", undefined, "veykor_session=" + mismatched)).status,
      401,
    );

    sqlite.prepare("update sessions set expires_at=1").run();
    sqlite.close();
    assert.equal((await request("me", undefined, secondCookie)).status, 401);

    for (let i = 0; i < 10; i++) {
      await request("auth/login", { ...credentials, password: "wrong" });
    }

    assert.equal((await request("auth/login", credentials)).status, 429);
    assert.equal((await request("visits")).status, 404);
    assert.equal((await request("health")).status, 200);
  } finally {
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
});
