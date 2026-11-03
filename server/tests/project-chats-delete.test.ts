import type { ChatSessionsResponse, ProjectsResponse, SidebarSectionsResponse } from "@veykor/shared";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("project delete-all-chats removes its chats and keeps the project", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-project-chats-delete-"));
  const database = join(folder, "test.db");
  const port = "31995";
  const origin = `http://localhost:${port}`;
  const secret = "test-secret-only-with-at-least-thirty-two-bytes";
  let child: ChildProcess;

  async function start() {
    child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        NODE_ENV: "test",
        JWT_SECRET: secret,
        PORT: port,
        DATABASE_URL: database,
        AUTH_COOKIE_SECURE: "false",
        AUTH_ORIGINS: origin,
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
    options: { method?: string; body?: unknown; cookie?: string } = {},
  ) {
    return fetch(`${origin}/api/${path}`, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Veykor-Request": "1",
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
    });
  }

  try {
    await start();

    const registration = await request("auth/register", {
      body: { username: "cleaner", password: "a-strong-test-password" },
    });

    assert.equal(registration.status, 200);

    const cookie = registration.headers.get("set-cookie")!.split(";")[0];

    const sections = (
      (await (
        await request("sidebar/sections", { cookie })
      ).json()) as unknown as SidebarSectionsResponse
    ).sections;
    const projectsSection = sections.find(
      (section) => section.kind === "projects",
    )!;
    const chatsSection = sections.find((section) => section.kind === "chats")!;

    const created = await request("projects", {
      method: "POST",
      body: {
        name: "Website",
        folder: join(folder, "website"),
        sectionId: projectsSection.id,
      },
      cookie,
    });

    assert.equal(created.status, 201);

    const projectId = ((await created.json()) as unknown as ProjectsResponse)
      .projects[0].id;

    const firstChat = {
      id: crypto.randomUUID(),
      title: "First chat",
      projectId,
      sectionId: null,
      modelId: "muse-spark-1.3",
    };
    const secondChat = {
      id: crypto.randomUUID(),
      title: "Second chat",
      projectId,
      sectionId: null,
      modelId: "muse-spark-1.3",
    };
    const looseChat = {
      id: crypto.randomUUID(),
      title: "Loose chat",
      projectId: null,
      sectionId: chatsSection.id,
      modelId: "muse-spark-1.3",
    };

    assert.equal(
      (
        await request("chat/sessions", {
          method: "PUT",
          body: { sessions: [firstChat, secondChat, looseChat] },
          cookie,
        })
      ).status,
      200,
    );

    assert.equal(
      (await request(`projects/${projectId}/chats`, { method: "DELETE" }))
        .status,
      401,
    );
    assert.equal(
      (await request("projects/missing-id/chats", { method: "DELETE", cookie }))
        .status,
      404,
    );

    const cleared = await request(`projects/${projectId}/chats`, {
      method: "DELETE",
      cookie,
    });

    assert.equal(cleared.status, 200);
    assert.equal(
      ((await cleared.json()) as unknown as { deleted: number }).deleted,
      2,
    );

    const remainingProjects = (
      (await (
        await request("projects", { cookie })
      ).json()) as unknown as ProjectsResponse
    ).projects;

    assert.equal(remainingProjects.length, 1);
    assert.equal(remainingProjects[0].id, projectId);

    const remainingSessions = (
      (await (
        await request("chat/sessions", { cookie })
      ).json()) as unknown as ChatSessionsResponse
    ).sessions;

    assert.deepEqual(
      remainingSessions.map((session) => session.id),
      [looseChat.id],
    );
  } finally {
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
});
