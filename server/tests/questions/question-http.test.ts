import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  questionPaths,
  veykorRequestHeaderName,
  veykorRequestHeaderValue,
} from "@veykor/shared";

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const testPort = "31992";

const baseUrl = `http://localhost:${testPort}`;

const ownerToken = "owner-team-token";
const memberToken = "member-team-token";

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
    bearer?: string;
  } = {},
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [veykorRequestHeaderName]: veykorRequestHeaderValue,
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...(options.bearer ? { Authorization: `Bearer ${options.bearer}` } : {}),
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

function seed(database: string) {
  const sqlite = new Database(database);

  const owner = sqlite
    .prepare("INSERT INTO users (username) VALUES (?) RETURNING id")
    .get("question-http-owner") as { id: number };

  const stranger = sqlite
    .prepare("INSERT INTO users (username) VALUES (?) RETURNING id")
    .get("question-http-stranger") as { id: number };

  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  sqlite
    .prepare(
      "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("owner-session", owner.id, expiresAt, new Date().toISOString());

  sqlite
    .prepare(
      "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("stranger-session", stranger.id, expiresAt, new Date().toISOString());

  sqlite
    .prepare(
      "INSERT INTO chats (id, user_id, title, team_token, agent_snapshot, muse_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "root-http",
      owner.id,
      "Root chat",
      ownerToken,
      JSON.stringify({ id: "agent-main", name: "Main" }),
      "muse-root",
      new Date().toISOString(),
      new Date().toISOString(),
    );

  sqlite
    .prepare(
      "INSERT INTO chats (id, user_id, title, parent_chat_id, team_token, agent_snapshot, muse_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "member-http",
      owner.id,
      "Tester",
      "root-http",
      memberToken,
      JSON.stringify({ id: "agent-tester", name: "Tester" }),
      "muse-member",
      new Date().toISOString(),
      new Date().toISOString(),
    );

  sqlite.close();
}

function mcpCall(
  chatId: string,
  token: string,
  id: string | number,
  name: string,
  args: unknown,
) {
  return fetch(`${baseUrl}/api/team-mcp/${chatId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      [veykorRequestHeaderName]: veykorRequestHeaderValue,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

function mcpText(body: Record<string, unknown>): string {
  const result = body["result"] as {
    content?: Array<{ text?: unknown }>;
  };

  return typeof result.content?.[0]?.text === "string"
    ? (result.content[0].text as string)
    : "";
}

function questionArgs() {
  return {
    questions: [
      {
        id: "approach",
        question: "How should this behave?",
        options: [
          { id: "automatic", label: "Automatically" },
          { id: "review", label: "Review first" },
        ],
      },
      { id: "notes", question: "Any notes?", options: [] },
    ],
  };
}

async function waitForPending(cookie: string, count: number): Promise<void> {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    const listed = await request(questionPaths.questions("root-http"), {
      cookie,
    });

    const pending = listed.body["pending"] as Array<unknown>;

    if (listed.status === 200 && pending.length >= count) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for the pending question.");
}

const ownerCookie = "veykor_session=owner-session";
const strangerCookie = "veykor_session=stranger-session";

test("question reads enforce authentication and ownership", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-question-http-"));
  const database = join(folder, "test.db");

  const child = await startServer(database);

  try {
    seed(database);

    assert.equal(
      (await request(questionPaths.questions("root-http"))).status,
      401,
    );

    const stranger = await request(questionPaths.questions("root-http"), {
      cookie: strangerCookie,
    });

    assert.equal(stranger.status, 404);

    const missing = await request(questionPaths.questions("nope"), {
      cookie: ownerCookie,
    });

    assert.equal(missing.status, 404);

    const listed = await request(questionPaths.questions("root-http"), {
      cookie: ownerCookie,
    });

    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body["pending"], []);
    assert.deepEqual(listed.body["settled"], []);

    const tools = await request("/api/team-mcp/root-http", {
      method: "POST",
      bearer: ownerToken,
      body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });

    const names = (
      (tools.body["result"] as { tools?: Array<{ name?: string }> }).tools ?? []
    ).map((tool) => tool.name);

    assert.ok(names.includes("ask_user"));

    const denied = await request("/api/team-mcp/root-http", {
      method: "POST",
      bearer: "wrong-token",
      body: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });

    assert.equal(denied.status, 401);
  } finally {
    await stopServer(child);
  }
});

test("malformed agent payloads fail with a useful tool error", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-question-http-"));
  const database = join(folder, "test.db");

  const child = await startServer(database);

  try {
    seed(database);

    const response = await mcpCall("root-http", ownerToken, 10, "ask_user", {
      questions: [{ id: "q", question: "Q?", options: [{ id: "only" }] }],
    });

    const body = (await response.json()) as Record<string, unknown>;
    const result = body["result"] as { isError?: boolean };

    assert.equal(result.isError, true);
    assert.match(mcpText(body), /two to five|label/i);

    const listed = await request(questionPaths.questions("root-http"), {
      cookie: ownerCookie,
    });

    assert.deepEqual(listed.body["pending"], []);
  } finally {
    await stopServer(child);
  }
});

test("agent questions wait for the user answer and resume", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-question-http-"));
  const database = join(folder, "test.db");

  const child = await startServer(database);

  try {
    seed(database);

    const asked = mcpCall(
      "member-http",
      memberToken,
      20,
      "ask_user",
      questionArgs(),
    );

    await waitForPending(ownerCookie, 1);

    const listed = await request(questionPaths.questions("root-http"), {
      cookie: ownerCookie,
    });

    const pending = listed.body["pending"] as Array<Record<string, unknown>>;

    assert.equal(pending.length, 1);
    assert.equal(pending[0]["memberId"], "member-http");
    assert.equal(pending[0]["agentName"], "Tester");
    assert.equal(pending[0]["isMain"], false);

    const requestId = pending[0]["id"] as string;

    const badAnswer = await request(
      questionPaths.answer("root-http", requestId),
      {
        method: "POST",
        cookie: ownerCookie,
        body: { answers: [{ questionId: "approach", optionId: "nope" }] },
      },
    );

    assert.equal(badAnswer.status, 400);

    const answered = await request(
      questionPaths.answer("root-http", requestId),
      {
        method: "POST",
        cookie: ownerCookie,
        body: {
          answers: [
            { questionId: "approach", optionId: "review" },
            { questionId: "notes", customText: "Ship it Friday." },
          ],
        },
      },
    );

    assert.equal(answered.status, 200);
    assert.equal(answered.body["alreadySettled"], false);

    const response = await asked;
    const delivered = JSON.parse(mcpText(await response.json())) as Record<
      string,
      unknown
    >;

    assert.equal(delivered["status"], "answered");
    assert.equal(delivered["requestId"], requestId);
    assert.deepEqual(delivered["answers"], [
      {
        questionId: "approach",
        kind: "option",
        optionId: "review",
        label: "Review first",
        customText: "",
      },
      {
        questionId: "notes",
        kind: "custom",
        optionId: "",
        label: "",
        customText: "Ship it Friday.",
      },
    ]);

    const repeated = await request(
      questionPaths.answer("root-http", requestId),
      {
        method: "POST",
        cookie: ownerCookie,
        body: {
          answers: [
            { questionId: "approach", optionId: "automatic" },
            { questionId: "notes", customText: "Changed." },
          ],
        },
      },
    );

    assert.equal(repeated.status, 200);
    assert.equal(repeated.body["alreadySettled"], true);
    assert.deepEqual(
      (repeated.body["request"] as Record<string, unknown>)["answers"],
      delivered["answers"],
    );

    const settled = await request(questionPaths.questions("root-http"), {
      cookie: ownerCookie,
    });

    assert.deepEqual(settled.body["pending"], []);
    assert.equal((settled.body["settled"] as Array<unknown>).length, 1);
  } finally {
    await stopServer(child);
  }
});

test("concurrent submissions resolve atomically to one answer", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-question-http-"));
  const database = join(folder, "test.db");

  const child = await startServer(database);

  try {
    seed(database);

    const asked = mcpCall(
      "root-http",
      ownerToken,
      25,
      "ask_user",
      questionArgs(),
    );

    await waitForPending(ownerCookie, 1);

    const listed = await request(questionPaths.questions("root-http"), {
      cookie: ownerCookie,
    });

    const pending = listed.body["pending"] as Array<Record<string, unknown>>;
    const requestId = pending[0]["id"] as string;

    const [first, second] = await Promise.all([
      request(questionPaths.answer("root-http", requestId), {
        method: "POST",
        cookie: ownerCookie,
        body: {
          answers: [
            { questionId: "approach", optionId: "automatic" },
            { questionId: "notes", customText: "First tab." },
          ],
        },
      }),
      request(questionPaths.answer("root-http", requestId), {
        method: "POST",
        cookie: ownerCookie,
        body: {
          answers: [
            { questionId: "approach", optionId: "review" },
            { questionId: "notes", customText: "Second tab." },
          ],
        },
      }),
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const flags = [
      first.body["alreadySettled"],
      second.body["alreadySettled"],
    ].sort();

    assert.deepEqual(flags, [false, true]);

    const firstAnswers = (first.body["request"] as Record<string, unknown>)[
      "answers"
    ];
    const secondAnswers = (second.body["request"] as Record<string, unknown>)[
      "answers"
    ];

    assert.deepEqual(firstAnswers, secondAnswers);

    const delivered = JSON.parse(mcpText(await (await asked).json())) as Record<
      string,
      unknown
    >;

    assert.deepEqual(delivered["answers"], firstAnswers);
  } finally {
    await stopServer(child);
  }
});

test("duplicate agent delivery asks once and resumes every waiter", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-question-http-"));
  const database = join(folder, "test.db");

  const child = await startServer(database);

  try {
    seed(database);

    const first = mcpCall(
      "root-http",
      ownerToken,
      30,
      "ask_user",
      questionArgs(),
    );
    const second = mcpCall(
      "root-http",
      ownerToken,
      30,
      "ask_user",
      questionArgs(),
    );

    await waitForPending(ownerCookie, 1);

    const listed = await request(questionPaths.questions("root-http"), {
      cookie: ownerCookie,
    });

    const pending = listed.body["pending"] as Array<Record<string, unknown>>;

    assert.equal(pending.length, 1);

    const requestId = pending[0]["id"] as string;

    await request(questionPaths.answer("root-http", requestId), {
      method: "POST",
      cookie: ownerCookie,
      body: {
        answers: [
          { questionId: "approach", optionId: "automatic" },
          { questionId: "notes", customText: "Once." },
        ],
      },
    });

    const one = JSON.parse(mcpText(await (await first).json())) as Record<
      string,
      unknown
    >;
    const two = JSON.parse(mcpText(await (await second).json())) as Record<
      string,
      unknown
    >;

    assert.equal(one["requestId"], requestId);
    assert.equal(two["requestId"], requestId);
    assert.deepEqual(one["answers"], two["answers"]);
  } finally {
    await stopServer(child);
  }
});

test("cancellation reaches the agent without an answer", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-question-http-"));
  const database = join(folder, "test.db");

  const child = await startServer(database);

  try {
    seed(database);

    const asked = mcpCall(
      "root-http",
      ownerToken,
      40,
      "ask_user",
      questionArgs(),
    );

    await waitForPending(ownerCookie, 1);

    const listed = await request(questionPaths.questions("root-http"), {
      cookie: ownerCookie,
    });

    const pending = listed.body["pending"] as Array<Record<string, unknown>>;
    const requestId = pending[0]["id"] as string;

    const cancelled = await request(
      questionPaths.cancel("root-http", requestId),
      { method: "POST", cookie: ownerCookie, body: {} },
    );

    assert.equal(cancelled.status, 200);
    assert.equal(
      (cancelled.body["request"] as Record<string, unknown>)["status"],
      "cancelled",
    );

    const delivered = JSON.parse(mcpText(await (await asked).json())) as Record<
      string,
      unknown
    >;

    assert.equal(delivered["status"], "cancelled");
    assert.equal(delivered["requestId"], requestId);
    assert.ok(typeof delivered["reason"] === "string");
    assert.equal("answers" in delivered, false);
  } finally {
    await stopServer(child);
  }
});
