import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type { AuthStatus } from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31987";

const baseUrl = `http://localhost:${testPort}`;

const lanOrigin = "http://192.168.1.10:5173";

interface TestResponse {
  status: number;
  body: Record<string, unknown>;
  cookie: string;
  rawCookie: string;
}

async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
    marker?: boolean;
  } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.marker === false
      ? {}
      : { [veykorRequestHeaderName]: veykorRequestHeaderValue }),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...(options.headers ?? {}),
  };

  const response = await fetch(baseUrl + path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const rawCookie = response.headers.get("set-cookie") ?? "";

  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    cookie: rawCookie.split(";")[0] ?? "",
    rawCookie,
  };
}

function startServer(database: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: serverDir,
      env: {
        ...process.env,
        PORT: testPort,
        DATABASE_URL: database,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timeout: ${stderr}`));
    }, 20000);

    child.stdout?.on("data", (data) => {
      if (String(data).includes("listening")) {
        clearTimeout(timer);
        resolve(child);
      }
    });

    child.stderr?.on("data", (data) => {
      stderr += String(data);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function stopServer(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}

test("local auth with host-machine registration and open login", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-auth-"));
  const database = join(folder, "test.db");

  let child = await startServer(database);

  try {
    const anonymous = await request(authPaths.status);
    const anonymousStatus = anonymous.body as unknown as AuthStatus;

    assert.equal(anonymous.status, 200);
    assert.equal(anonymousStatus.authenticated, false);
    assert.deepEqual(anonymousStatus.user, { id: 0, username: "" });
    assert.equal(anonymousStatus.expiresAt, 0);
    assert.equal(anonymousStatus.registrationAllowed, true);

    const health = await request("/api/health");

    assert.equal(health.status, 200);
    assert.equal(health.body["status"], "ok");

    assert.equal((await request(authPaths.me)).status, 401);

    const withoutMarker = await request(authPaths.register, {
      body: { username: "alex", password: "a-strong-test-password" },
      marker: false,
    });

    assert.equal(withoutMarker.status, 403);

    const lanRegistration = await request(authPaths.register, {
      body: { username: "alex", password: "a-strong-test-password" },
      headers: { Origin: lanOrigin },
    });

    assert.equal(lanRegistration.status, 403);

    const lanStatus = (
      await request(authPaths.status, {
        headers: { Origin: lanOrigin },
      })
    ).body as unknown as AuthStatus;

    assert.equal(lanStatus.registrationAllowed, false);

    const weakRegistration = await request(authPaths.register, {
      body: { username: "alex", password: "short" },
    });

    assert.equal(weakRegistration.status, 400);

    const registered = await request(authPaths.register, {
      body: { username: "alex", password: "a-strong-test-password" },
    });

    assert.equal(registered.status, 201);
    assert.match(registered.rawCookie, /HttpOnly/i);
    assert.match(registered.rawCookie, /SameSite=Lax/i);

    const registeredCookie = registered.cookie;

    assert.notEqual(registeredCookie, "");

    const duplicate = await request(authPaths.register, {
      body: { username: "alex", password: "another-strong-password" },
    });

    assert.equal(duplicate.status, 409);

    const afterRegister = (
      await request(authPaths.status, {
        cookie: registeredCookie,
      })
    ).body as unknown as AuthStatus;

    assert.equal(afterRegister.authenticated, true);
    assert.equal(afterRegister.user.username, "alex");

    const other = await request(authPaths.register, {
      body: { username: "sam", password: "a-strong-test-password" },
    });

    assert.equal(other.status, 201);

    const wrongPassword = await request(authPaths.login, {
      body: { username: "sam", password: "wrong-password" },
    });

    assert.equal(wrongPassword.status, 401);

    const lanLogin = await request(authPaths.login, {
      body: { username: "sam", password: "a-strong-test-password" },
      headers: { Origin: lanOrigin },
    });

    assert.equal(lanLogin.status, 200);

    const memberCookie = lanLogin.cookie;

    const me = await request(authPaths.me, { cookie: memberCookie });

    assert.equal(me.status, 200);

    const logout = await request(authPaths.logout, {
      body: {},
      cookie: memberCookie,
    });

    assert.equal(logout.status, 200);
    assert.equal((logout.body as unknown as AuthStatus).authenticated, false);

    const afterLogout = (
      await request(authPaths.status, {
        cookie: memberCookie,
      })
    ).body as unknown as AuthStatus;

    assert.equal(afterLogout.authenticated, false);

    const relogin = await request(authPaths.login, {
      body: { username: "sam", password: "a-strong-test-password" },
    });

    const persistentCookie = relogin.cookie;

    await stopServer(child);
    child = await startServer(database);

    const afterRestart = (
      await request(authPaths.status, {
        cookie: persistentCookie,
      })
    ).body as unknown as AuthStatus;

    assert.equal(afterRestart.authenticated, true);
    assert.equal(afterRestart.user.username, "sam");
  } finally {
    await stopServer(child);
    rmSync(folder, { recursive: true, force: true });
  }
});
