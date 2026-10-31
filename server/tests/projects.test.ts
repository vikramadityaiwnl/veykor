import type { ProjectsResponse, SidebarSectionsResponse } from "@veykor/shared";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";

test("projects default empty list, create, rename, host-only creation, move, cascade and persistence", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-projects-"));
  const database = join(folder, "test.db");
  const port = "31989";
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
    options: {
      method?: string;
      body?: unknown;
      cookie?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<
    Omit<Response, "json"> & { json: () => Promise<ProjectsResponse> }
  > {
    const base =
      options.headers?.Host != null ? `http://${options.headers.Host}` : origin;

    return fetch(base + "/api/" + path, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Veykor-Request": "1",
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.headers ?? {}),
      },
    }) as Promise<
      Omit<Response, "json"> & { json: () => Promise<ProjectsResponse> }
    >;
  }

  async function projects(cookie: string): Promise<ProjectsResponse> {
    const response = await request("projects", { cookie });

    assert.equal(response.status, 200);
    return response.json();
  }

  try {
    await start();

    assert.equal((await request("projects")).status, 401);

    const registration = await request("auth/register", {
      body: { username: "alex", password: "a-strong-test-password" },
    });

    assert.equal(registration.status, 200);

    const cookie = registration.headers.get("set-cookie")!.split(";")[0];

    const sectionsResponse = await request("sidebar/sections", { cookie });

    assert.equal(sectionsResponse.status, 200);

    const sections = (
      (await sectionsResponse.json()) as unknown as SidebarSectionsResponse
    ).sections;
    const projectsSection = sections.find(
      (section) => section.kind === "projects",
    )!;
    const chatsSection = sections.find((section) => section.kind === "chats")!;

    assert.deepEqual(await projects(cookie), { projects: [] });

    assert.equal(
      (
        await request("projects", {
          method: "POST",
          body: { name: "   " },
          cookie,
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request("projects", {
          method: "POST",
          body: { name: "No section" },
          cookie,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("projects", {
          method: "POST",
          body: { name: "Chat project", sectionId: chatsSection.id },
          cookie,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("projects", {
          method: "POST",
          body: { name: "Lost project", sectionId: "missing-section" },
          cookie,
        })
      ).status,
      400,
    );

    const created = await request("projects", {
      method: "POST",
      body: {
        name: "  Website  ",
        folder: "  website  ",
        sectionId: projectsSection.id,
      },
      cookie,
    });

    assert.equal(created.status, 201);

    const afterCreate = await created.json();

    assert.equal(afterCreate.projects.length, 1);
    assert.equal(afterCreate.projects[0].name, "Website");
    assert.equal(afterCreate.projects[0].folder, "website");
    assert.equal(afterCreate.projects[0].position, 0);
    assert.equal(afterCreate.projects[0].sectionId, projectsSection.id);
    assert.equal(typeof afterCreate.projects[0].id, "string");

    const withoutFolder = await request("projects", {
      method: "POST",
      body: { name: "Notes", sectionId: projectsSection.id },
      cookie,
    });

    assert.equal(withoutFolder.status, 400);

    assert.equal(
      (
        await request("projects", {
          method: "POST",
          body: { name: "Empty", folder: "   ", sectionId: projectsSection.id },
          cookie,
        })
      ).status,
      400,
    );

    const websiteId = afterCreate.projects[0].id;
    const renamed = await request(`projects/${websiteId}`, {
      method: "PATCH",
      body: { name: "  Site  " },
      cookie,
    });

    assert.equal(renamed.status, 200);

    const afterRename = await renamed.json();

    assert.equal(afterRename.projects[0].name, "Site");
    assert.equal(afterRename.projects[0].folder, "website");

    assert.equal(
      (
        await request(`projects/${websiteId}`, {
          method: "PATCH",
          body: { name: "  " },
          cookie,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("projects/missing-id", {
          method: "PATCH",
          body: { name: "Nope" },
          cookie,
        })
      ).status,
      404,
    );

    const otherRegistration = await request("auth/register", {
      body: { username: "brother", password: "eight888" },
    });

    assert.equal(otherRegistration.status, 200);

    const otherCookie = otherRegistration.headers
      .get("set-cookie")!
      .split(";")[0];

    assert.deepEqual(await projects(otherCookie), { projects: [] });
    assert.equal(
      (
        await request(`projects/${websiteId}`, {
          method: "PATCH",
          body: { name: "Taken" },
          cookie: otherCookie,
        })
      ).status,
      404,
    );

    const networkAddress = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .find((entry) => !entry.internal && entry.family === "IPv4")?.address;

    if (networkAddress) {
      const lanHeaders = {
        Origin: `http://${networkAddress}:${port}`,
        Host: `${networkAddress}:${port}`,
      };

      assert.equal(
        (
          await request("projects", {
            method: "POST",
            body: { name: "Remote" },
            cookie,
            headers: lanHeaders,
          })
        ).status,
        403,
      );

      const lanRenamed = await request(`projects/${websiteId}`, {
        method: "PATCH",
        body: { name: "Site" },
        cookie,
        headers: lanHeaders,
      });

      assert.equal(lanRenamed.status, 200);

      assert.equal(
        (await request("projects", { cookie, headers: lanHeaders })).status,
        200,
      );
    }

    const secondSectionResponse = await request("sidebar/sections", {
      method: "POST",
      body: { title: "Archive", kind: "projects" },
      cookie,
    });

    assert.equal(secondSectionResponse.status, 201);

    const secondSection = (
      (await secondSectionResponse.json()) as unknown as SidebarSectionsResponse
    ).sections.find((section) => section.title === "Archive")!;

    const moved = await request(`projects/${websiteId}`, {
      method: "PATCH",
      body: { sectionId: secondSection.id },
      cookie,
    });

    assert.equal(moved.status, 200);
    assert.equal((await moved.json()).projects[0].sectionId, secondSection.id);

    assert.equal(
      (
        await request(`projects/${websiteId}`, {
          method: "PATCH",
          body: { sectionId: chatsSection.id },
          cookie,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(`projects/${websiteId}`, {
          method: "PATCH",
          body: { sectionId: "missing-section" },
          cookie,
        })
      ).status,
      400,
    );

    const movedBack = await request(`projects/${websiteId}`, {
      method: "PATCH",
      body: { sectionId: projectsSection.id },
      cookie,
    });

    assert.equal(movedBack.status, 200);

    const tempProject = await request("projects", {
      method: "POST",
      body: { name: "Temp", folder: "temp", sectionId: secondSection.id },
      cookie,
    });

    assert.equal(tempProject.status, 201);

    assert.equal(
      (
        await request(`sidebar/sections/${secondSection.id}`, {
          method: "DELETE",
          cookie,
        })
      ).status,
      200,
    );

    assert.deepEqual(
      (await projects(cookie)).projects.map((project) => project.name),
      ["Site"],
    );

    await stop();
    await start();

    const login = await request("auth/login", {
      body: { username: "alex", password: "a-strong-test-password" },
    });

    assert.equal(login.status, 200);

    const loginCookie = login.headers.get("set-cookie")!.split(";")[0];
    const persisted = await projects(loginCookie);

    assert.deepEqual(
      persisted.projects.map((project) => project.name),
      ["Site"],
    );
  } finally {
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
});
