import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authPaths,
  chatPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31995";

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

test("host folder selection, project assignments, agent CRUD, and ownership", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "veykor-work-"));
  const folder = join(temporary, "sample-project");
  mkdirSync(folder);
  mkdirSync(join(folder, "src"));
  let child: ChildProcess | null = null;

  try {
    child = await startServer(join(temporary, "test.db"));
    const first = await request(authPaths.register, {
      body: { username: "work-owner", password: "a-strong-test-password" },
    });
    assert.equal(first.status, 201);
    const cookie = first.cookie;

    assert.equal((await request("/api/agents")).status, 401);
    assert.equal(
      (await request("/api/agents", { cookie, body: null })).status,
      400,
    );
    assert.deepEqual((await request("/api/projects", { cookie })).body, []);
    assert.equal(
      (
        await request("/api/projects/folders", {
          cookie,
          headers: { "X-Forwarded-For": "192.168.1.2" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/projects", {
          cookie,
          body: { folder },
          headers: { "X-Forwarded-For": "192.168.1.2" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/projects/pick-folder", {
          cookie,
          body: {},
          headers: { "X-Forwarded-For": "192.168.1.2" },
        })
      ).status,
      403,
    );
    const listing = await request(
      `/api/projects/folders?path=${encodeURIComponent(folder)}`,
      { cookie },
    );
    assert.equal(listing.status, 200);
    assert.equal(listing.body.path, realpathSync(folder));
    assert.deepEqual(listing.body.folders, [
      { name: "src", path: join(realpathSync(folder), "src") },
    ]);
    assert.equal(
      (await request("/api/projects", { cookie, body: { folder: "relative" } }))
        .status,
      400,
    );
    assert.equal(
      (await request("/api/agents", { cookie, body: { name: "  " } })).status,
      400,
    );

    const agent = await request("/api/agents", {
      cookie,
      body: {
        name: " Builder ",
        avatar: "B",
        description: "Builds features",
        instructions: "Read the project first.",
      },
    });
    assert.equal(agent.status, 201);
    assert.equal(agent.body.name, "Builder");
    assert.equal(agent.body.permission, "read-only");
    assert.equal(agent.body.modelId, "");
    assert.equal(agent.body.autoAddToNewProjects, false);
    const agentId = agent.body.id as string;
    assert.equal(
      (
        await request("/api/projects", {
          cookie,
          body: { folder, agentIds: ["missing"] },
        })
      ).status,
      400,
    );
    const created = await request("/api/projects", {
      cookie,
      body: { folder, agentIds: [agentId], sectionId: "recent" },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.name, "sample-project");
    assert.equal(created.body.folder, realpathSync(folder));
    assert.equal(created.body.branch, "No branch");
    const projectId = created.body.id as string;
    const library = (await request("/api/agents", { cookie }))
      .body as unknown as Array<{ id: string; autoAddToNewProjects: boolean }>;
    assert.deepEqual(created.body.agentIds, [
      agentId,
      ...library
        .filter((entry) => entry.autoAddToNewProjects)
        .map((entry) => entry.id),
    ]);

    assert.equal(
      (
        await request(chatPaths.chats, {
          cookie,
          body: { projectId, agentId: "missing" },
        })
      ).status,
      400,
    );
    const updated = await request(`/api/agents/${agentId}`, {
      cookie,
      method: "PUT",
      body: { ...agent.body, instructions: "Updated instructions" },
    });
    assert.equal(updated.body.instructions, "Updated instructions");
    const renamed = await request(`/api/projects/${projectId}`, {
      cookie,
      method: "PUT",
      body: { name: "Renamed", agentIds: [agentId], sectionId: "work-section" },
    });
    assert.equal(renamed.body.name, "Renamed");
    assert.equal(renamed.body.sectionId, "work-section");

    const second = await request(authPaths.register, {
      body: { username: "other-owner", password: "a-strong-test-password" },
    });
    assert.equal(second.status, 201);
    assert.deepEqual(
      (
        (await request("/api/agents", { cookie: second.cookie }))
          .body as unknown as Array<{ name: string }>
      ).map((entry) => entry.name),
      ["Team Lead", "Coder", "Reviewer", "GitHub Manager"],
    );
    assert.deepEqual(
      (await request("/api/projects", { cookie: second.cookie })).body,
      [],
    );
    assert.equal(
      (
        await request(`/api/agents/${agentId}`, {
          cookie: second.cookie,
          method: "PUT",
          body: agent.body,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/api/projects/${projectId}`, {
          cookie: second.cookie,
          method: "PUT",
          body: { name: "Stolen" },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(chatPaths.chats, {
          cookie: second.cookie,
          body: { projectId, agentId },
        })
      ).status,
      404,
    );

    assert.equal(
      (await request(`/api/agents/${agentId}`, { cookie, method: "DELETE" }))
        .status,
      200,
    );
    const projects = (await request("/api/projects", { cookie }))
      .body as unknown as { agentIds: string[] }[];
    assert.deepEqual(projects[0].agentIds, []);
    assert.deepEqual(
      (
        (await request("/api/agents", { cookie })).body as unknown as Array<{
          name: string;
        }>
      ).map((entry) => entry.name),
      ["Team Lead", "Coder", "Reviewer", "GitHub Manager"],
    );

    await stopServer(child);
    child = await startServer(join(temporary, "test.db"));
    assert.equal(
      (
        (await request("/api/projects", { cookie })).body as unknown as {
          name: string;
        }[]
      )[0].name,
      "Renamed",
    );
    assert.equal(
      (
        await request(`/api/projects/${projectId}`, {
          cookie: second.cookie,
          method: "DELETE",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/api/projects/${projectId}`, {
          cookie,
          method: "DELETE",
        })
      ).status,
      200,
    );
    assert.deepEqual((await request("/api/projects", { cookie })).body, []);
    assert.equal(existsSync(folder), true);
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(temporary, { recursive: true, force: true });
  }
});
