import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authPaths,
  memoryPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31998";

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
  } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [veykorRequestHeaderName]: veykorRequestHeaderValue,
    ...(options.cookie ? { Cookie: options.cookie } : {}),
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

test("memories stay owned and support manual CRUD with scope changes", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-memory-flow-"));
  const database = join(folder, "test.db");
  const projectFolder = join(folder, "sample-project");

  mkdirSync(projectFolder);

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    assert.equal((await request(memoryPaths.memories)).status, 401);

    const registered = await request(authPaths.register, {
      body: { username: "memory-owner", password: "a-strong-test-password" },
    });

    assert.equal(registered.status, 201);

    const cookie = registered.cookie;

    assert.deepEqual((await request(memoryPaths.memories, { cookie })).body, {
      memories: [],
    });

    assert.equal(
      (await request(memoryPaths.memories, { cookie, body: {} })).status,
      400,
    );

    assert.equal(
      (
        await request(memoryPaths.memories, {
          cookie,
          body: { instruction: "  " },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(memoryPaths.memories, {
          cookie,
          body: { instruction: "x".repeat(2001) },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(memoryPaths.memories, {
          cookie,
          body: { instruction: "Orphan project rule.", scope: "project" },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(memoryPaths.memories, {
          cookie,
          body: {
            instruction: "Confused scope.",
            scope: "global",
            projectId: "project",
          },
        })
      ).status,
      400,
    );

    const created = await request(memoryPaths.memories, {
      cookie,
      body: { instruction: "Always run the tests." },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body["scope"], "global");
    assert.equal(created.body["origin"], "manual");
    assert.equal(created.body["sourceExists"], false);

    const memoryId = created.body["id"] as string;

    assert.notEqual(memoryId, "");

    assert.equal(
      (
        await request(memoryPaths.memories, {
          cookie,
          body: { instruction: "  ALWAYS   run the tests. " },
        })
      ).status,
      409,
    );

    const other = await request(authPaths.register, {
      body: { username: "memory-stranger", password: "a-strong-test-password" },
    });

    assert.equal(other.status, 201);

    assert.deepEqual(
      (await request(memoryPaths.memories, { cookie: other.cookie })).body,
      { memories: [] },
    );

    assert.equal(
      (
        await request(memoryPaths.memory(memoryId), {
          cookie: other.cookie,
        })
      ).status,
      404,
    );

    assert.equal(
      (
        await request(memoryPaths.memory(memoryId), {
          cookie: other.cookie,
          method: "PUT",
          body: { instruction: "Hijacked." },
        })
      ).status,
      404,
    );

    const project = await request("/api/projects", {
      cookie,
      body: { folder: projectFolder },
    });

    assert.equal(project.status, 201);

    const projectId = project.body["id"] as string;

    const projectMemory = await request(memoryPaths.memories, {
      cookie,
      body: {
        instruction: "Use tabs in this project.",
        scope: "project",
        projectId,
      },
    });

    assert.equal(projectMemory.status, 201);
    assert.equal(projectMemory.body["projectName"], "sample-project");

    const projectMemoryId = projectMemory.body["id"] as string;

    assert.equal(
      (
        await request(memoryPaths.memories, {
          cookie,
          body: {
            instruction: "Missing project.",
            scope: "project",
            projectId: "missing",
          },
        })
      ).status,
      404,
    );

    const strangerProject = await request("/api/projects", {
      cookie: other.cookie,
      body: { folder: projectFolder },
    });

    assert.equal(strangerProject.status, 201);

    assert.equal(
      (
        await request(memoryPaths.memories, {
          cookie,
          body: {
            instruction: " чужой project.",
            scope: "project",
            projectId: strangerProject.body["id"],
          },
        })
      ).status,
      404,
    );

    const globals = await request(`${memoryPaths.memories}?scope=global`, {
      cookie,
    });

    assert.equal(globals.status, 200);
    assert.equal((globals.body["memories"] as Array<unknown>).length, 1);

    const byProject = await request(
      `${memoryPaths.memories}?scope=project&projectId=${projectId}`,
      { cookie },
    );

    assert.equal(byProject.status, 200);
    assert.equal((byProject.body["memories"] as Array<unknown>).length, 1);

    const searched = await request(
      `${memoryPaths.memories}?query=${encodeURIComponent("tabs")}`,
      { cookie },
    );

    assert.equal(searched.status, 200);
    assert.equal((searched.body["memories"] as Array<unknown>).length, 1);

    const fetched = await request(memoryPaths.memory(projectMemoryId), {
      cookie,
    });

    assert.equal(fetched.status, 200);
    assert.equal(fetched.body["instruction"], "Use tabs in this project.");

    const updated = await request(memoryPaths.memory(projectMemoryId), {
      cookie,
      method: "PUT",
      body: {
        instruction: "Use spaces in this project.",
        expectedUpdatedAt: fetched.body["updatedAt"],
      },
    });

    assert.equal(updated.status, 200);
    assert.equal(updated.body["instruction"], "Use spaces in this project.");

    assert.equal(
      (
        await request(memoryPaths.memory(projectMemoryId), {
          cookie,
          method: "PUT",
          body: {
            instruction: "Stale write.",
            expectedUpdatedAt: fetched.body["updatedAt"],
          },
        })
      ).status,
      409,
    );

    const moved = await request(memoryPaths.memory(projectMemoryId), {
      cookie,
      method: "PUT",
      body: { scope: "global" },
    });

    assert.equal(moved.status, 200);
    assert.equal(moved.body["scope"], "global");
    assert.equal(moved.body["projectId"], "");

    const movedBack = await request(memoryPaths.memory(projectMemoryId), {
      cookie,
      method: "PUT",
      body: { scope: "project", projectId },
    });

    assert.equal(movedBack.status, 200);
    assert.equal(movedBack.body["scope"], "project");

    const restored = await request(memoryPaths.undo(projectMemoryId), {
      cookie,
      body: {
        expectedUpdatedAt: movedBack.body["updatedAt"],
        previousInstruction: "Use spaces in this project.",
        previousScope: "global",
        previousProjectId: "",
      },
    });

    assert.equal(restored.status, 200);
    assert.equal(restored.body["scope"], "global");

    const doomed = await request(memoryPaths.memories, {
      cookie,
      body: { instruction: "Forget me." },
    });

    assert.equal(doomed.status, 201);

    const doomedId = doomed.body["id"] as string;

    const undoneSave = await request(memoryPaths.undo(doomedId), {
      cookie,
      body: { expectedUpdatedAt: doomed.body["updatedAt"] },
    });

    assert.equal(undoneSave.status, 200);
    assert.equal(undoneSave.body["deleted"], true);

    assert.equal(
      (await request(memoryPaths.memory(doomedId), { cookie })).status,
      404,
    );

    const deleted = await request(memoryPaths.memory(memoryId), {
      cookie,
      method: "DELETE",
    });

    assert.equal(deleted.status, 200);

    assert.equal(
      (await request(memoryPaths.memory(memoryId), { cookie })).status,
      404,
    );
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});

test("project deletion removes project memories while globals survive", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-memory-project-"));
  const database = join(folder, "test.db");
  const projectFolder = join(folder, "doomed-project");

  mkdirSync(projectFolder);

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    const registered = await request(authPaths.register, {
      body: { username: "project-owner", password: "a-strong-test-password" },
    });

    assert.equal(registered.status, 201);

    const cookie = registered.cookie;

    const project = await request("/api/projects", {
      cookie,
      body: { folder: projectFolder },
    });

    assert.equal(project.status, 201);

    const projectId = project.body["id"] as string;

    const projectMemory = await request(memoryPaths.memories, {
      cookie,
      body: {
        instruction: "Doomed project rule.",
        scope: "project",
        projectId,
      },
    });

    assert.equal(projectMemory.status, 201);

    const globalMemory = await request(memoryPaths.memories, {
      cookie,
      body: { instruction: "Surviving global rule." },
    });

    assert.equal(globalMemory.status, 201);

    const removed = await request(`/api/projects/${projectId}`, {
      cookie,
      method: "DELETE",
    });

    assert.equal(removed.status, 200);

    const remaining = await request(memoryPaths.memories, { cookie });

    assert.equal(remaining.status, 200);

    const memories = remaining.body["memories"] as Array<{
      id: string;
      instruction: string;
    }>;

    assert.equal(memories.length, 1);
    assert.equal(memories[0].instruction, "Surviving global rule.");
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});
