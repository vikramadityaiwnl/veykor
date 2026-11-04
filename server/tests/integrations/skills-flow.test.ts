import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authPaths,
  chatPaths,
  skillPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31997";

const baseUrl = `http://localhost:${testPort}`;

function workspacesDir(folder: string): string {
  return join(folder, "workspaces");
}

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

function skillFiles(folder: string, slug: string): Array<string> {
  const root = workspacesDir(folder);

  if (!existsSync(root)) {
    return [];
  }

  const found: Array<string> = [];

  for (const user of readdirSync(root, { withFileTypes: true })) {
    if (!user.isDirectory()) {
      continue;
    }

    const file = join(root, user.name, ".agents", "skills", slug, "SKILL.md");

    if (existsSync(file)) {
      found.push(file);
    }
  }

  return found;
}

test("skills follow the convention, stay owned, and reach sessions", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-skills-flow-"));
  const database = join(folder, "test.db");
  const name = `Flow Skill ${process.pid}`;
  const slug = `flow-skill-${process.pid}`;

  let child: ChildProcess | null = null;

  try {
    child = await startServer(database);

    assert.equal((await request(skillPaths.skills)).status, 401);

    const registered = await request(authPaths.register, {
      body: { username: "skills-owner", password: "a-strong-test-password" },
    });

    assert.equal(registered.status, 201);

    const cookie = registered.cookie;

    assert.deepEqual((await request(skillPaths.skills, { cookie })).body, {
      skills: [],
    });

    assert.equal(
      (
        await request(skillPaths.skills, {
          cookie,
          body: {
            name: "!!!",
            description: "Bad skill.",
            instructions: "Be bad.",
          },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(skillPaths.skills, {
          cookie,
          body: {
            name: "Good",
            description: "First line.\nSecond line.",
            instructions: "Be good.",
          },
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await request(skillPaths.skills, {
          cookie,
          body: { name },
        })
      ).status,
      400,
    );

    const created = await request(skillPaths.skills, {
      cookie,
      body: {
        name,
        description: "Greets the user warmly.",
        instructions: "Reply with a warm greeting.",
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body["slug"], slug);
    assert.equal(created.body["enabled"], true);
    assert.equal(created.body["instructions"], "Reply with a warm greeting.");

    const skillId = created.body["id"] as string;

    assert.notEqual(skillId, "");

    const files = skillFiles(folder, slug);

    assert.equal(files.length, 1);
    assert.equal(
      readFileSync(files[0], "utf8"),
      `---\nname: ${slug}\ndescription: Greets the user warmly.\n---\n\n` +
        `# ${name}\n\nReply with a warm greeting.\n`,
    );

    assert.equal(
      (
        await request(skillPaths.skills, {
          cookie,
          body: {
            name,
            description: "Duplicate skill.",
            instructions: "Duplicate.",
          },
        })
      ).status,
      409,
    );

    const other = await request(authPaths.register, {
      body: { username: "skills-stranger", password: "a-strong-test-password" },
    });

    assert.equal(other.status, 201);

    assert.deepEqual(
      (await request(skillPaths.skills, { cookie: other.cookie })).body,
      { skills: [] },
    );

    assert.equal(
      (await request(skillPaths.skill(skillId), { cookie: other.cookie }))
        .status,
      404,
    );

    assert.equal(
      (
        await request(skillPaths.skill(skillId), {
          cookie: other.cookie,
          method: "PUT",
          body: { name: "Stolen" },
        })
      ).status,
      404,
    );

    assert.equal(skillFiles(folder, slug).length, 1);

    const renamed = await request(skillPaths.skill(skillId), {
      cookie,
      method: "PUT",
      body: { name: `${name} Renamed` },
    });

    assert.equal(renamed.status, 400);
    assert.equal(
      (await request(skillPaths.skill(skillId), { cookie })).body["name"],
      name,
    );

    const edited = await request(skillPaths.skill(skillId), {
      cookie,
      method: "PUT",
      body: {
        description: "Greets the user briefly.",
        instructions: "Reply with a short greeting.",
      },
    });

    assert.equal(edited.status, 200);
    assert.equal(edited.body["name"], name);
    assert.equal(edited.body["slug"], slug);
    assert.equal(
      readFileSync(skillFiles(folder, slug)[0], "utf8").includes(
        "Reply with a short greeting.",
      ),
      true,
    );

    const started = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(started.status, 201);

    const chatId = (started.body as { chat: { id: string } }).chat.id;
    const attached = (await request(skillPaths.chatSkills(chatId), {
      cookie,
    })) as unknown as {
      status: number;
      body: { skills: Array<{ selector: string; source: string }> };
    };

    assert.equal(attached.status, 200);
    assert.ok(
      attached.body.skills.some(
        (entry) => entry.selector === slug && entry.source === "project",
      ),
    );

    assert.equal(
      (await request(skillPaths.chatSkills(chatId), { cookie: other.cookie }))
        .status,
      404,
    );

    assert.equal(
      (await request(skillPaths.chatSkills("missing"), { cookie })).status,
      404,
    );

    const disabled = await request(skillPaths.skill(skillId), {
      cookie,
      method: "PUT",
      body: { enabled: false },
    });

    assert.equal(disabled.status, 200);
    assert.equal(skillFiles(folder, slug).length, 0);

    const fresh = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });

    assert.equal(fresh.status, 201);

    const freshId = (fresh.body as { chat: { id: string } }).chat.id;
    const absent = (await request(skillPaths.chatSkills(freshId), {
      cookie,
    })) as unknown as {
      status: number;
      body: { skills: Array<{ selector: string }> };
    };

    assert.equal(absent.status, 200);
    assert.equal(
      absent.body.skills.some((entry) => entry.selector === slug),
      false,
    );

    assert.equal(
      (
        await request(skillPaths.skill(skillId), {
          cookie,
          method: "DELETE",
        })
      ).status,
      200,
    );

    assert.equal(
      (await request(skillPaths.skill(skillId), { cookie })).status,
      404,
    );
    assert.equal(skillFiles(folder, slug).length, 0);
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(folder, { recursive: true, force: true });
  }
});
