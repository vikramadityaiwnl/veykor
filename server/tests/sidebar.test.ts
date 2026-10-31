import type { SidebarSectionsResponse } from "@veykor/shared";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("sidebar sections defaults, CRUD, isolation and delete-all state", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-sidebar-"));
  const database = join(folder, "test.db");
  const port = "31988";
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
    } = {},
  ): Promise<
    Omit<Response, "json"> & { json: () => Promise<SidebarSectionsResponse> }
  > {
    return fetch(origin + "/api/" + path, {
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
    }) as Promise<
      Omit<Response, "json"> & { json: () => Promise<SidebarSectionsResponse> }
    >;
  }

  async function sections(cookie: string): Promise<SidebarSectionsResponse> {
    const response = await request("sidebar/sections", { cookie });

    assert.equal(response.status, 200);
    return response.json();
  }

  try {
    await start();

    assert.equal((await request("sidebar/sections")).status, 401);

    const registration = await request("auth/register", {
      body: { username: "alex", password: "a-strong-test-password" },
    });

    assert.equal(registration.status, 200);

    const cookie = registration.headers.get("set-cookie")!.split(";")[0];
    const defaults = await sections(cookie);

    assert.deepEqual(
      defaults.sections.map((section) => section.title),
      ["Chats", "Projects"],
    );
    assert.deepEqual(
      defaults.sections.map((section) => section.kind),
      ["chats", "projects"],
    );
    assert.deepEqual(
      defaults.sections.map((section) => section.position),
      [0, 1],
    );
    assert.deepEqual(
      defaults.sections.map((section) => section.isExpanded),
      [false, true],
    );
    assert.deepEqual(
      defaults.sections.map((section) => section.isFixed),
      [true, false],
    );

    assert.equal(
      (
        await request("sidebar/sections", {
          method: "POST",
          body: { title: "   " },
          cookie,
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request("sidebar/sections", {
          method: "POST",
          body: { title: "Reading" },
          cookie,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("sidebar/sections", {
          method: "POST",
          body: { title: "Reading", kind: "custom" },
          cookie,
        })
      ).status,
      400,
    );

    const created = await request("sidebar/sections", {
      method: "POST",
      body: { title: "  Research  ", kind: "projects" },
      cookie,
    });

    assert.equal(created.status, 201);

    const afterCreate = await created.json();
    const research = afterCreate.sections[2];

    assert.equal(research.title, "Research");
    assert.equal(research.kind, "projects");
    assert.equal(research.position, 2);
    assert.equal(research.isExpanded, true);
    assert.equal(research.isFixed, false);
    assert.equal(typeof research.id, "string");

    const renamed = await request(`sidebar/sections/${research.id}`, {
      method: "PATCH",
      body: { title: "Reading" },
      cookie,
    });

    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).sections[2].title, "Reading");

    const chats = afterCreate.sections[0];
    const toggled = await request(`sidebar/sections/${chats.id}`, {
      method: "PATCH",
      body: { isExpanded: true },
      cookie,
    });

    assert.equal(toggled.status, 200);
    assert.equal((await toggled.json()).sections[0].isExpanded, true);
    assert.equal(
      (
        await request(`sidebar/sections/${chats.id}`, {
          method: "DELETE",
          cookie,
        })
      ).status,
      403,
    );

    const chatSection = await request("sidebar/sections", {
      method: "POST",
      body: { title: "Work chats", kind: "chats" },
      cookie,
    });

    assert.equal(chatSection.status, 201);

    const workChats = (await chatSection.json()).sections[3];

    assert.equal(workChats.kind, "chats");
    assert.equal(workChats.isFixed, false);
    assert.equal(
      (
        await request(`sidebar/sections/${workChats.id}`, {
          method: "DELETE",
          cookie,
        })
      ).status,
      200,
    );

    assert.equal(
      (
        await request(`sidebar/sections/${research.id}`, {
          method: "PATCH",
          body: { title: "" },
          cookie,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("sidebar/sections/missing-id", {
          method: "PATCH",
          body: { title: "Nope" },
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
    const otherDefaults = await sections(otherCookie);

    assert.deepEqual(
      otherDefaults.sections.map((section) => section.title),
      ["Chats", "Projects"],
    );
    assert.equal(
      (
        await request(`sidebar/sections/${research.id}`, {
          method: "DELETE",
          cookie: otherCookie,
        })
      ).status,
      404,
    );

    for (const section of [...afterCreate.sections].slice(1)) {
      const removed = await request(`sidebar/sections/${section.id}`, {
        method: "DELETE",
        cookie,
      });

      assert.equal(removed.status, 200);
    }

    assert.deepEqual(
      (await sections(cookie)).sections.map((section) => section.title),
      ["Chats"],
    );

    await stop();
    await start();

    const login = await request("auth/login", {
      body: { username: "alex", password: "a-strong-test-password" },
    });

    assert.equal(login.status, 200);

    const loginCookie = login.headers.get("set-cookie")!.split(";")[0];

    assert.deepEqual(
      (await sections(loginCookie)).sections.map((section) => section.title),
      ["Chats"],
    );
    assert.deepEqual(
      (await sections(otherCookie)).sections.map((section) => section.title),
      ["Chats", "Projects"],
    );
  } finally {
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
});
