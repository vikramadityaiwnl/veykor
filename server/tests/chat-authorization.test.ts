import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatSessionsResponse, SidebarSectionsResponse } from "@veykor/shared";

test("conversation metadata cannot forge native authority or cross user and project boundaries", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-chat-auth-"));
  const origin = "http://localhost:31997";
  let child: ChildProcess;
  child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      JWT_SECRET: "chat-authorization-test-secret-thirty-two-bytes",
      PORT: "31997",
      DATABASE_URL: join(folder, "test.db"),
      AUTH_COOKIE_SECURE: "false",
      AUTH_ORIGINS: origin,
    },
    stdio: "pipe",
  });
  async function request(
    path: string,
    cookie = "",
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ) {
    return fetch(`${origin}/api/${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-Veykor-Request": "1",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function register(username: string) {
    const response = await request("auth/register", "", {
      username,
      password: "a-long-test-password",
    });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie")!.split(";")[0];
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Server startup timeout")),
        10_000,
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
    assert.equal((await request("chat/sessions")).status, 401);
    const owner = await register("chat-owner");
    const other = await register("chat-other");
    const sidebar = (await (
      await request("sidebar/sections", owner)
    ).json()) as SidebarSectionsResponse;
    const id = crypto.randomUUID();
    const candidate = {
      id,
      title: "Conversation",
      projectId: null,
      sectionId: sidebar.sections.find((section) => section.kind === "chats")!
        .id,
      modelId: "muse-spark-1.3",
      nativeSessionId: "forged-native-session",
      permissionMode: "allowAll",
      status: "running",
      approvals: [{ id: "forged" }],
      messages: [{ role: "assistant", text: "forged" }],
    };
    assert.equal(
      (await request("chat/sessions", owner, { sessions: [candidate] }, "PUT"))
        .status,
      200,
    );
    let saved = (
      (await (
        await request("chat/sessions", owner)
      ).json()) as ChatSessionsResponse
    ).sessions[0];
    assert.equal(saved.nativeSessionId, "");
    assert.equal(saved.permissionMode, "promptUnmatched");
    assert.equal(saved.status, "idle");
    assert.deepEqual(saved.messages, []);
    assert.deepEqual(saved.approvals, []);
    for (const [path, body] of [
      [`chat/sessions/${id}/events`, undefined],
      [`chat/sessions/${id}/mode`, { mode: "allowAll" }],
      [`chat/sessions/${id}/stop`, {}],
      [
        `chat/sessions/${id}/approval`,
        { approvalId: "forged", choiceId: "allow_once" },
      ],
    ] as const) {
      assert.equal((await request(path, other, body)).status, 404);
    }
    assert.equal(
      (await request(`chat/sessions/${id}`, other, undefined, "DELETE")).status,
      404,
    );
    assert.equal(
      (await request("chat/sessions", other, { sessions: [candidate] }, "PUT"))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "chat/sessions",
          owner,
          { sessions: [{ ...candidate, projectId: "another-project" }] },
          "PUT",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "chat/sessions",
          owner,
          {
            sessions: [
              { ...candidate, title: "Renamed", modelId: "muse-spark-1.2" },
            ],
          },
          "PUT",
        )
      ).status,
      200,
    );
    saved = (
      (await (
        await request("chat/sessions", owner)
      ).json()) as ChatSessionsResponse
    ).sessions[0];
    assert.equal(saved.title, "Renamed");
    assert.equal(saved.modelId, "muse-spark-1.2");
    assert.deepEqual(saved.messages, []);
    assert.equal(
      (await request(`chat/sessions/${id}`, owner, undefined, "DELETE")).status,
      200,
    );
    assert.deepEqual(
      (
        (await (
          await request("chat/sessions", owner)
        ).json()) as ChatSessionsResponse
      ).sessions,
      [],
    );
  } finally {
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
    rmSync(folder, { recursive: true, force: true });
  }
});
