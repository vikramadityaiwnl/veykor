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
  profilePaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";
import type { UserProfile } from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31989";

const baseUrl = `http://localhost:${testPort}`;

interface TestResponse {
  status: number;
  body: Record<string, unknown>;
}

async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    marker?: boolean;
  } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.marker === false
      ? {}
      : { [veykorRequestHeaderName]: veykorRequestHeaderValue }),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
  };

  const response = await fetch(baseUrl + path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
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

async function register(username: string): Promise<string> {
  const response = await fetch(baseUrl + authPaths.register, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [veykorRequestHeaderName]: veykorRequestHeaderValue,
    },
    body: JSON.stringify({ username, password: "a-strong-test-password" }),
  });

  assert.equal(response.status, 201);

  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

  assert.notEqual(cookie, "");

  return cookie;
}

test("profile defaults, update, and password change", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-profile-"));
  const database = join(folder, "test.db");

  let child = await startServer(database);

  try {
    const anonymous = await request(profilePaths.profile);

    assert.equal(anonymous.status, 401);

    const cookie = await register("alex");

    const initial = await request(profilePaths.profile, { cookie });

    assert.equal(initial.status, 200);
    assert.deepEqual(initial.body, {
      username: "alex",
      tag: "Building",
      status: "",
    } satisfies UserProfile);

    const withoutMarker = await request(profilePaths.profile, {
      method: "PUT",
      body: { username: "alex", tag: "Building", status: "" },
      cookie,
      marker: false,
    });

    assert.equal(withoutMarker.status, 403);

    const invalid = await request(profilePaths.profile, {
      method: "PUT",
      body: { username: "x", tag: "", status: "" },
      cookie,
    });

    assert.equal(invalid.status, 400);

    await register("sam");

    const taken = await request(profilePaths.profile, {
      method: "PUT",
      body: { username: "sam", tag: "Building", status: "" },
      cookie,
    });

    assert.equal(taken.status, 409);

    const updated = await request(profilePaths.profile, {
      method: "PUT",
      body: { username: "alexander", tag: "  Maker  ", status: "Heads down" },
      cookie,
    });

    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body, {
      username: "alexander",
      tag: "Maker",
      status: "Heads down",
    } satisfies UserProfile);

    const reloaded = await request(profilePaths.profile, { cookie });

    assert.equal(reloaded.status, 200);
    assert.deepEqual(reloaded.body, updated.body);

    const wrongCurrent = await request(authPaths.changePassword, {
      body: {
        currentPassword: "wrong-password",
        newPassword: "a-new-test-password",
      },
      cookie,
    });

    assert.equal(wrongCurrent.status, 401);

    const weakNew = await request(authPaths.changePassword, {
      body: { currentPassword: "a-strong-test-password", newPassword: "short" },
      cookie,
    });

    assert.equal(weakNew.status, 400);

    const changed = await request(authPaths.changePassword, {
      body: {
        currentPassword: "a-strong-test-password",
        newPassword: "a-new-test-password",
      },
      cookie,
    });

    assert.equal(changed.status, 200);
    assert.deepEqual(changed.body, { changed: true });

    const oldLogin = await request(authPaths.login, {
      body: { username: "alexander", password: "a-strong-test-password" },
    });

    assert.equal(oldLogin.status, 401);

    const newLogin = await request(authPaths.login, {
      body: { username: "alexander", password: "a-new-test-password" },
    });

    assert.equal(newLogin.status, 200);

    await stopServer(child);
    child = await startServer(database);

    const afterRestart = await request(profilePaths.profile, { cookie });

    assert.equal(afterRestart.status, 200);
    assert.deepEqual(afterRestart.body, updated.body);
  } finally {
    await stopServer(child);
    rmSync(folder, { recursive: true, force: true });
  }
});
