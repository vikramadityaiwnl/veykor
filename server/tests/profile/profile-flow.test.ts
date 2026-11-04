import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authPaths,
  defaultPreferences,
  profilePaths,
  preferencesPaths,
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

test("remove all data resets one account and preserves its login", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-data-reset-"));
  const database = join(folder, "test.db");

  let child = await startServer(database);

  try {
    const ownerCookie = await register("reset-owner");
    const otherCookie = await register("reset-other");
    const defaultAgents = await request("/api/agents", {
      cookie: ownerCookie,
    });

    assert.equal(defaultAgents.status, 200);

    const customAgent = await request("/api/agents", {
      method: "POST",
      body: {
        name: "Temporary agent",
        description: "Created for a data reset test.",
      },
      cookie: ownerCookie,
    });

    assert.equal(customAgent.status, 201);

    const otherAgent = await request("/api/agents", {
      method: "POST",
      body: {
        name: "Keep this agent",
        description: "Owned by another account.",
      },
      cookie: otherCookie,
    });

    assert.equal(otherAgent.status, 201);

    const savedPreferences = {
      ...defaultPreferences(),
      sections: [{ id: "custom", title: "Custom", open: false }],
    };
    const preferencesUpdate = await request(preferencesPaths.preferences, {
      method: "PUT",
      body: savedPreferences,
      cookie: ownerCookie,
    });

    assert.equal(preferencesUpdate.status, 200);

    const sqlite = new Database(database);
    const ownerId = sqlite
      .prepare("SELECT id FROM users WHERE username = ?")
      .get("reset-owner") as { id: number };
    const skillRoot = join(
      folder,
      "workspaces",
      String(ownerId.id),
      ".agents",
      "skills",
    );
    const managedSkillFolder = join(skillRoot, "veykor-managed-skill");
    const externalSkillFolder = join(skillRoot, "external-prototype-skill");
    const projectFolder = join(folder, "project-files");
    const projectFile = join(projectFolder, "prototype.html");
    const skillDefinition = join(managedSkillFolder, "SKILL.md");
    const skillPrototype = join(managedSkillFolder, "prototype.js");

    mkdirSync(managedSkillFolder, { recursive: true });
    mkdirSync(externalSkillFolder, { recursive: true });
    mkdirSync(projectFolder, { recursive: true });
    writeFileSync(skillDefinition, "---\nname: veykor-managed-skill\n---\n");
    writeFileSync(skillPrototype, "export const prototype = true;\n");
    writeFileSync(projectFile, "<h1>Project prototype</h1>\n");
    sqlite
      .prepare(
        "INSERT INTO skills (id, user_id, slug, name, description, instructions, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "managed-skill",
        ownerId.id,
        "veykor-managed-skill",
        "Veykor managed skill",
        "Managed in app",
        "Skill instructions",
        1,
        "",
        "",
      );
    sqlite
      .prepare("INSERT INTO chats (id, user_id, title) VALUES (?, ?, ?)")
      .run("reset-chat", ownerId.id, "Temporary chat");
    sqlite
      .prepare(
        "INSERT INTO projects (id, user_id, name, folder) VALUES (?, ?, ?, ?)",
      )
      .run("reset-project", ownerId.id, "Temporary project", projectFolder);
    sqlite
      .prepare(
        "INSERT INTO mcp_servers (id, user_id, name, transport, config) VALUES (?, ?, ?, ?, ?)",
      )
      .run("reset-mcp", ownerId.id, "Temporary MCP", "stdio", "{}");
    sqlite
      .prepare(
        "INSERT INTO memories (id, user_id, instruction) VALUES (?, ?, ?)",
      )
      .run("reset-memory", ownerId.id, "Temporary memory");
    sqlite
      .prepare(
        "INSERT INTO generated_images (id, user_id, chat_id) VALUES (?, ?, ?)",
      )
      .run("reset-image", ownerId.id, "reset-chat");
    sqlite.close();

    const unconfirmed = await request(profilePaths.data, {
      method: "DELETE",
      cookie: ownerCookie,
    });

    assert.equal(unconfirmed.status, 400);

    const removed = await request(profilePaths.data, {
      method: "DELETE",
      body: { confirmation: "REMOVE" },
      cookie: ownerCookie,
    });

    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body, { removed: true });

    const ownerProfile = await request(profilePaths.profile, {
      cookie: ownerCookie,
    });
    const ownerAgents = await request("/api/agents", {
      cookie: ownerCookie,
    });
    const ownerPreferences = await request(preferencesPaths.preferences, {
      cookie: ownerCookie,
    });
    const otherAgents = await request("/api/agents", {
      cookie: otherCookie,
    });

    assert.equal(ownerProfile.status, 200);
    assert.equal(ownerAgents.status, 200);
    assert.deepEqual(
      (ownerAgents.body as unknown as Array<{ name: string }>)
        .map((agent) => agent.name)
        .sort(),
      ["GitHub Manager", "Plan & Code", "Reviewer"],
    );
    assert.deepEqual(ownerPreferences.body, {
      ...defaultPreferences(),
      agentsSeeded: true,
    });
    assert.equal(otherAgents.status, 200);
    assert.equal(
      (otherAgents.body as unknown as Array<{ name: string }>).length,
      4,
    );
    assert.equal(existsSync(skillDefinition), false);
    assert.equal(existsSync(skillPrototype), true);
    assert.equal(existsSync(managedSkillFolder), true);
    assert.equal(existsSync(externalSkillFolder), true);
    assert.equal(existsSync(projectFile), true);

    const resetSqlite = new Database(database);

    for (const table of [
      "chats",
      "projects",
      "mcp_servers",
      "memories",
      "generated_images",
    ]) {
      const count = resetSqlite
        .prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id = ?`)
        .get(ownerId.id) as { total: number };

      assert.equal(count.total, 0, `${table} should be reset`);
    }

    resetSqlite.close();
  } finally {
    await stopServer(child);
    rmSync(folder, { recursive: true, force: true });
  }
});
