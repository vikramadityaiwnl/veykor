import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
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

const testPort = "31994";

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

test("project sessions isolate chats, enforce access, pin folder and agent config, and clean up", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "veykor-project-sessions-"));
  const folder = join(temporary, "session-project");
  mkdirSync(folder);

  let child: ChildProcess | null = null;

  try {
    child = await startServer(join(temporary, "test.db"));

    const first = await request(authPaths.register, {
      body: { username: "session-owner", password: "a-strong-test-password" },
    });
    assert.equal(first.status, 201);
    const cookie = first.cookie;

    assert.equal(
      (
        await request(chatPaths.chats, {
          body: { projectId: "missing", agentId: "missing" },
        })
      ).status,
      401,
    );

    const agent = await request("/api/agents", {
      cookie,
      body: {
        name: "Session Agent",
        instructions: "Follow the project conventions.",
        permission: "approved",
      },
    });
    assert.equal(agent.status, 201);
    const agentId = agent.body.id as string;

    const outsider = await request("/api/agents", {
      cookie,
      body: { name: "Outsider" },
    });
    assert.equal(outsider.status, 201);
    const outsiderId = outsider.body.id as string;

    const created = await request("/api/projects", {
      cookie,
      body: { folder, agentIds: [agentId] },
    });
    assert.equal(created.status, 201);
    const projectId = created.body.id as string;

    assert.equal(
      (
        await request(chatPaths.chats, {
          cookie,
          body: { projectId, agentId: outsiderId },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(chatPaths.chats, {
          cookie,
          body: { projectId },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(chatPaths.chats, {
          cookie,
          body: { projectId: "missing", agentId },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(chatPaths.chats, {
          cookie,
          body: { agentId },
        })
      ).status,
      400,
    );

    const second = await request(authPaths.register, {
      body: {
        username: "session-stranger",
        password: "a-strong-test-password",
      },
    });
    assert.equal(second.status, 201);
    assert.equal(
      (
        await request(chatPaths.chats, {
          cookie: second.cookie,
          body: { projectId, agentId },
        })
      ).status,
      404,
    );

    const session = await request(chatPaths.chats, {
      cookie,
      body: { projectId, agentId },
    });
    assert.equal(session.status, 201);
    const sessionBody = session.body as {
      chat: {
        id: string;
        projectId: string;
        agentId: string;
        agentName: string;
        museSessionId: string;
      };
      permission: string;
    };
    assert.equal(sessionBody.chat.projectId, projectId);
    assert.equal(sessionBody.chat.agentId, agentId);
    assert.equal(sessionBody.chat.agentName, "Session Agent");
    assert.notEqual(sessionBody.chat.museSessionId, "");
    assert.equal(sessionBody.permission, "approved");
    const sessionId = sessionBody.chat.id;
    const storedContext = (id: string) => {
      const connection = new Database(join(temporary, "test.db"), {
        readonly: true,
      });

      try {
        return (
          connection
            .prepare("SELECT agent_context FROM chats WHERE id = ?")
            .get(id) as { agent_context: string }
        ).agent_context;
      } finally {
        connection.close();
      }
    };
    const initialContext = storedContext(sessionId);
    assert.match(initialContext, /Session Agent/);
    assert.match(initialContext, /Follow the project conventions/);
    assert.match(initialContext, /session-project/);

    const general = await request(chatPaths.chats, {
      cookie,
      body: { sectionId: "recent" },
    });
    assert.equal(general.status, 201);
    const generalId = (general.body as { chat: { id: string } }).chat.id;
    assert.equal(storedContext(generalId), "");

    const listed = (await request(chatPaths.chats, { cookie }))
      .body as unknown as Array<{
      id: string;
      projectId: string;
      agentId: string;
    }>;
    assert.equal(listed.length, 2);
    assert.equal(
      listed.find((entry) => entry.id === sessionId)?.projectId,
      projectId,
    );
    assert.equal(
      listed.find((entry) => entry.id === sessionId)?.agentId,
      agentId,
    );
    assert.equal(listed.find((entry) => entry.id === generalId)?.projectId, "");
    assert.equal(listed.find((entry) => entry.id === generalId)?.agentId, "");

    await request(chatPaths.chat(sessionId), { cookie });
    await request(chatPaths.chat(generalId), { cookie });
    assert.equal(
      (
        (await request(chatPaths.chats, { cookie }))
          .body as unknown as unknown[]
      ).length,
      2,
    );

    const edited = await request(`/api/agents/${agentId}`, {
      cookie,
      method: "PUT",
      body: {
        name: "Renamed Agent",
        instructions: "Changed instructions.",
        permission: "full-access",
      },
    });
    assert.equal(edited.status, 200);

    const unassigned = await request(`/api/projects/${projectId}`, {
      cookie,
      method: "PUT",
      body: { name: "session-project", agentIds: [] },
    });
    assert.equal(unassigned.status, 200);

    assert.equal(
      (await request(`/api/agents/${agentId}`, { cookie, method: "DELETE" }))
        .status,
      200,
    );

    const preserved = await request(chatPaths.chat(sessionId), { cookie });
    assert.equal(storedContext(sessionId), initialContext);
    assert.equal(preserved.status, 200);
    assert.equal(
      (preserved.body as { chat: { agentName: string } }).chat.agentName,
      "Session Agent",
    );

    const locked = await request(chatPaths.settings(sessionId), {
      cookie,
      method: "PUT",
      body: { permission: "full-access" },
    });
    assert.equal(locked.status, 200);
    assert.equal(
      (locked.body as { permission: string }).permission,
      "approved",
    );

    const goneFolder = join(temporary, "gone-project");
    mkdirSync(goneFolder);

    const replacement = await request("/api/agents", {
      cookie,
      body: { name: "Replacement" },
    });
    assert.equal(replacement.status, 201);
    const replacementId = replacement.body.id as string;

    const doomed = await request("/api/projects", {
      cookie,
      body: { folder: goneFolder, agentIds: [replacementId] },
    });
    assert.equal(doomed.status, 201);
    const doomedId = doomed.body.id as string;

    rmSync(goneFolder, { recursive: true, force: true });

    const blocked = await request(chatPaths.chats, {
      cookie,
      body: { projectId: doomedId, agentId: replacementId },
    });
    assert.equal(blocked.status, 400);
    assert.match(String(blocked.body.error ?? ""), /folder/i);
    assert.equal(
      (
        (await request(chatPaths.chats, { cookie }))
          .body as unknown as unknown[]
      ).length,
      2,
    );

    assert.equal(
      (
        await request(`/api/projects/${doomedId}`, {
          cookie,
          method: "DELETE",
        })
      ).status,
      200,
    );

    const renamed = await request(chatPaths.chat(sessionId), {
      method: "PATCH",
      cookie,
      body: { title: "Project kickoff" },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body["title"], "Project kickoff");

    const reassigned = await request(`/api/projects/${projectId}`, {
      cookie,
      method: "PUT",
      body: { name: "session-project", agentIds: [replacementId] },
    });
    assert.equal(reassigned.status, 200);

    const followup = await request(chatPaths.chats, {
      cookie,
      body: { projectId, agentId: replacementId },
    });
    assert.equal(followup.status, 201);
    const followupId = (followup.body as { chat: { id: string } }).chat.id;

    assert.equal(
      (
        await request(chatPaths.chat(sessionId), {
          cookie,
          method: "DELETE",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(chatPaths.chat(sessionId), { cookie })).status,
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
    assert.equal(
      (await request(chatPaths.chat(followupId), { cookie })).status,
      404,
    );
    assert.equal(existsSync(folder), true);

    const remaining = (await request(chatPaths.chats, { cookie }))
      .body as unknown as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((entry) => entry.id),
      [generalId],
    );
    assert.equal(
      (await request(chatPaths.chat(generalId), { cookie })).status,
      200,
    );
  } finally {
    if (child) {
      await stopServer(child);
    }

    rmSync(temporary, { recursive: true, force: true });
  }
});
