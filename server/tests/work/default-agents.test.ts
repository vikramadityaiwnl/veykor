import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authPaths,
  preferencesPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31984";

const baseUrl = `http://localhost:${testPort}`;

interface TestResponse {
  status: number;
  body: Record<string, unknown>;
  cookie: string;
}

async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [veykorRequestHeaderName]: veykorRequestHeaderValue,
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...options.headers,
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

interface AgentRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  modelId: string;
  providerId: string;
  reasoningEffort: string;
  permission: string;
  autoAddToNewProjects: boolean;
}

const defaultNames = ["Plan & Code", "Reviewer", "GitHub Manager"];

const defaultConfigs: Record<
  string,
  {
    modelId: string;
    providerId: string;
    reasoningEffort: string;
    permission: string;
  }
> = {
  "Plan & Code": {
    modelId: "muse-spark-1.3-contributor",
    providerId: "meta",
    reasoningEffort: "max",
    permission: "approved",
  },
  Reviewer: {
    modelId: "muse-spark-1.3-contributor",
    providerId: "meta",
    reasoningEffort: "max",
    permission: "approved",
  },
  "GitHub Manager": {
    modelId: "muse-spark-1.3-contributor",
    providerId: "meta",
    reasoningEffort: "max",
    permission: "approved",
  },
};

test("default agents seed once and auto-add to new projects", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "veykor-default-agents-"));
  const database = join(temporary, "test.db");
  const folder = join(temporary, "starter-project");
  mkdirSync(folder);
  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);
    const first = await request(authPaths.register, {
      body: { username: "defaults-owner", password: "a-strong-test-password" },
    });
    assert.equal(first.status, 201);
    const cookie = first.cookie;

    const agents = (await request("/api/agents", { cookie }))
      .body as unknown as Array<AgentRow>;
    assert.deepEqual(
      agents.map((agent) => agent.name),
      defaultNames,
    );

    for (const agent of agents) {
      const config = defaultConfigs[agent.name];

      assert.notEqual(agent.id, "");
      assert.notEqual(agent.description, "");
      assert.notEqual(agent.instructions, "");
      assert.match(agent.instructions, /\n\n/);

      if (agent.name === "Plan & Code") {
        assert.match(agent.instructions, /concrete plan/);
        assert.match(agent.instructions, /code tests/);
        assert.match(
          agent.instructions,
          /subagents within your own Plan & Code session/,
        );
        assert.match(
          agent.instructions,
          /Do not delegate implementation work to other team agents or teammates/,
        );
        assert.match(
          agent.instructions,
          /current branch and in the shared working tree/,
        );
        assert.match(
          agent.instructions,
          /do not create or switch to another worktree/,
        );
      }

      if (agent.name === "GitHub Manager") {
        assert.match(agent.instructions, /Conventional Commits/);
        assert.match(agent.instructions, /72 characters/);
      }

      if (agent.name === "Reviewer") {
        assert.match(agent.instructions, /security/);
        assert.match(agent.instructions, /consistent with the existing UI/);
      }

      assert.equal(agent.modelId, config.modelId);
      assert.equal(agent.providerId, config.providerId);
      assert.equal(agent.reasoningEffort, config.reasoningEffort);
      assert.equal(agent.permission, config.permission);
      assert.equal(agent.autoAddToNewProjects, true);
    }

    const seededIds = agents.map((agent) => agent.id);

    const storedPreferences = await request(preferencesPaths.preferences, {
      cookie,
    });
    assert.equal(storedPreferences.body["agentsSeeded"], true);

    const created = await request("/api/projects", {
      cookie,
      body: { folder, agentIds: [] },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body["agentIds"], seededIds);

    const solo = await request("/api/agents", {
      cookie,
      body: { name: "Solo", autoAddToNewProjects: false },
    });
    assert.equal(solo.status, 201);
    assert.equal(solo.body["autoAddToNewProjects"], false);
    const soloId = solo.body["id"] as string;

    const secondFolder = join(temporary, "second-project");
    mkdirSync(secondFolder);
    const second = await request("/api/projects", {
      cookie,
      body: { folder: secondFolder, agentIds: [soloId] },
    });
    assert.equal(second.status, 201);
    assert.deepEqual(second.body["agentIds"], [soloId, ...seededIds]);

    const enabled = await request(`/api/agents/${soloId}`, {
      cookie,
      method: "PUT",
      body: { ...solo.body, autoAddToNewProjects: true },
    });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.body["autoAddToNewProjects"], true);

    const thirdFolder = join(temporary, "third-project");
    mkdirSync(thirdFolder);
    const third = await request("/api/projects", {
      cookie,
      body: { folder: thirdFolder, agentIds: [] },
    });
    assert.equal(third.status, 201);
    assert.deepEqual(third.body["agentIds"], [...seededIds, soloId]);

    const thirdId = third.body["id"] as string;
    const edited = await request(`/api/projects/${thirdId}`, {
      cookie,
      method: "PUT",
      body: { name: "third-project", agentIds: [soloId] },
    });
    assert.equal(edited.status, 200);
    assert.deepEqual(edited.body["agentIds"], [soloId]);

    assert.equal(
      (
        await request(`/api/agents/${seededIds[0]}`, {
          cookie,
          method: "DELETE",
        })
      ).status,
      200,
    );

    await stopServer(child);
    child = await startServer(database);

    const remaining = (await request("/api/agents", { cookie }))
      .body as unknown as Array<AgentRow>;
    assert.deepEqual(
      remaining.map((agent) => agent.id),
      [...seededIds.slice(1), soloId],
    );

    await stopServer(child);
    child = null;
    const direct = new Database(database);
    const legacy = direct
      .prepare("INSERT INTO users (username) VALUES (?)")
      .run("legacy-owner");
    const legacyId = Number(legacy.lastInsertRowid);
    direct
      .prepare(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
      )
      .run("legacy-session", legacyId, Math.floor(Date.now() / 1000) + 3600);
    direct
      .prepare("INSERT INTO preferences (user_id, data) VALUES (?, ?)")
      .run(legacyId, JSON.stringify({ lastTab: "chat" }));
    direct.close();

    child = await startServer(database);
    const legacyCookie = "veykor_session=legacy-session";
    const legacyAgents = (
      await request("/api/agents", { cookie: legacyCookie })
    ).body as unknown as Array<AgentRow>;
    assert.deepEqual(
      legacyAgents.map((agent) => agent.name),
      defaultNames,
    );

    const legacyPreferences = await request(preferencesPaths.preferences, {
      cookie: legacyCookie,
    });
    assert.equal(legacyPreferences.body["agentsSeeded"], true);

    await stopServer(child);
    child = await startServer(database);

    const legacyAgain = (await request("/api/agents", { cookie: legacyCookie }))
      .body as unknown as Array<AgentRow>;
    assert.deepEqual(
      legacyAgain.map((agent) => agent.id),
      legacyAgents.map((agent) => agent.id),
    );
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(temporary, { recursive: true, force: true });
  }
});
