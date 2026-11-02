import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSnapshot } from "@veykor/shared";
import { buildInstructionPrefix, stripInstructionPrefix, isToolAllowed, denyChoiceId, agentCapabilityIssues, buildAgentSnapshot } from "../src/agents/agent-config.js";
import { validAgentInput, normalizeAgentInput } from "../src/agents/validation.js";

const draft = {
  name: "Reviewer",
  description: "Reviews code",
  instructions: "Be concise",
  providerId: "muse" as const,
  modelId: "muse-spark-1.3",
  reasoningEffort: "" as const,
  permissionMode: "promptUnmatched" as const,
  projectIds: [] as string[],
  toolsMode: "unrestricted" as const,
  allowedTools: [] as string[],
  skillsMode: "unrestricted" as const,
  skillIds: [] as string[],
  mcpMode: "unrestricted" as const,
  mcpServerIds: [] as string[],
};

test("agent input validation and normalization distinguish unrestricted from empty", () => {
  assert.equal(validAgentInput(draft), true);
  assert.equal(validAgentInput({ ...draft, name: "  " }), false);
  assert.equal(validAgentInput({ ...draft, providerId: "codex" }), false);
  assert.equal(validAgentInput({ ...draft, reasoningEffort: "turbo" }), false);
  assert.equal(
    validAgentInput({
      ...draft,
      toolsMode: "restricted",
      allowedTools: ["bad tool!"],
    }),
    false,
  );

  const restricted = normalizeAgentInput({
    ...draft,
    toolsMode: "restricted",
    allowedTools: [],
    skillsMode: "restricted",
    skillIds: [],
    mcpMode: "restricted",
    mcpServerIds: [],
  });

  assert.equal(restricted.toolsMode, "restricted");
  assert.deepEqual(restricted.allowedTools, []);

  const cleared = normalizeAgentInput({
    ...draft,
    allowedTools: ["shell"],
    skillIds: ["agents-skills/demo"],
  });

  assert.deepEqual(cleared.allowedTools, []);
  assert.deepEqual(cleared.skillIds, []);
});

test("capability issues block unsupported provider promises", () => {
  assert.deepEqual(
    agentCapabilityIssues({
      providerId: "opencode",
      permissionMode: "onRequest",
      mcpMode: "unrestricted",
    }).length,
    1,
  );
  assert.deepEqual(
    agentCapabilityIssues({
      providerId: "opencode",
      permissionMode: "promptUnmatched",
      mcpMode: "restricted",
    }).length,
    1,
  );
  assert.deepEqual(
    agentCapabilityIssues({
      providerId: "muse",
      permissionMode: "onRequest",
      mcpMode: "restricted",
    }),
    [],
  );
});

test("tool allowlist, deny choice, instructions envelope, and snapshot freezing", () => {
  const snapshot: AgentSnapshot = {
    agentId: "agent-1",
    name: "Reviewer",
    providerId: "muse",
    modelId: "muse-spark-1.3",
    reasoningEffort: "high",
    permissionMode: "promptUnmatched",
    instructions: "Be concise",
    toolsMode: "restricted",
    allowedTools: ["read", "search*"],
    skillsMode: "restricted",
    skillIds: [],
    mcpMode: "restricted",
    mcpServerIds: [],
  };

  assert.equal(isToolAllowed(null, "anything"), true);
  assert.equal(isToolAllowed(snapshot, "read"), true);
  assert.equal(isToolAllowed(snapshot, "searchFiles"), true);
  assert.equal(isToolAllowed(snapshot, "shell"), false);
  assert.equal(
    isToolAllowed({ ...snapshot, toolsMode: "unrestricted" }, "shell"),
    true,
  );
  assert.equal(isToolAllowed({ ...snapshot, allowedTools: [] }, "read"), false);
  assert.equal(
    denyChoiceId([
      { choiceId: "allow-once", label: "Allow once", scope: "once" },
      { choiceId: "deny", label: "Deny", scope: "once" },
    ]),
    "deny",
  );

  const prefix = buildInstructionPrefix("Be concise");
  assert.equal(stripInstructionPrefix(`${prefix}Hello`), "Hello");
  assert.equal(stripInstructionPrefix("Hello"), "Hello");
  assert.equal(buildInstructionPrefix("  "), "");

  const frozen = buildAgentSnapshot(
    {
      id: "agent-1",
      name: "Reviewer",
      description: "",
      instructions: "Be concise",
      providerId: "muse",
      modelId: "muse-spark-1.3",
      reasoningEffort: "",
      permissionMode: "promptUnmatched",
      projectIds: ["project-1"],
      toolsMode: "restricted",
      allowedTools: ["read"],
      skillsMode: "unrestricted",
      skillIds: [],
      mcpMode: "unrestricted",
      mcpServerIds: [],
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "muse-spark-1.3",
      name: "Spark",
      description: "",
      contextWindow: 0,
      inputPrice: 0,
      cachedPrice: 0,
      outputPrice: 0,
      pricingAvailable: false,
      reasoningEfforts: [{ tier: "high", description: "" }],
      defaultReasoningEffort: "high",
    },
  );

  assert.equal(frozen.reasoningEffort, "high");
  assert.deepEqual(frozen.allowedTools, ["read"]);
});

test("agents CRUD, ownership, project access, snapshot, and locking", async () => {
  const folder = mkdtempSync(join(tmpdir(), "veykor-agents-"));
  const database = join(folder, "test.db");
  const port = "32017";
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
        15000,
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
  ): Promise<Response> {
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

  async function register(username: string): Promise<string> {
    const response = await request("auth/register", {
      body: { username, password: "a-strong-test-password" },
    });

    assert.equal(response.status, 200);
    return response.headers.get("set-cookie")!.split(";")[0];
  }

  try {
    await start();

    assert.equal((await request("agents")).status, 401);

    const cookie = await register("agent-owner");
    const otherCookie = await register("agent-other");

    const settingsResponse = await request("settings", { cookie });
    const settings = (await settingsResponse.json()) as {
      providers: {
        id: string;
        available: boolean;
        models: { id: string; defaultReasoningEffort: string }[];
      }[];
    };
    const provider = settings.providers.find(
      (entry) => entry.available && entry.models.length > 0,
    );

    const sectionsResponse = await request("sidebar/sections", { cookie });
    const sections = (
      (await sectionsResponse.json()) as {
        sections: { id: string; kind: string }[];
      }
    ).sections;
    const projectsSection = sections.find(
      (section) => section.kind === "projects",
    )!;
    const chatsSection = sections.find((section) => section.kind === "chats")!;

    const projectResponse = await request("projects", {
      method: "POST",
      body: { name: "Website", folder, sectionId: projectsSection.id },
      cookie,
    });

    assert.equal(projectResponse.status, 201);
    const project = (
      (await projectResponse.json()) as {
        projects: { id: string }[];
      }
    ).projects[0];

    const input = {
      ...draft,
      providerId: (provider?.id || "muse") as "muse" | "opencode",
      modelId: provider?.models[0]?.id || "muse-spark-1.3",
      projectIds: [project.id],
    };

    const invalidProject = await request("agents", {
      method: "POST",
      body: { ...input, projectIds: ["missing-project"] },
      cookie,
    });

    assert.equal(invalidProject.status, 400);

    const unsupported = await request("agents", {
      method: "POST",
      body: { ...input, providerId: "opencode", permissionMode: "onRequest" },
      cookie,
    });

    assert.equal(unsupported.status, 400);

    const createdResponse = await request("agents", {
      method: "POST",
      body: input,
      cookie,
    });

    assert.equal(createdResponse.status, 201);
    const agent = (await createdResponse.json()) as {
      id: string;
      name: string;
    };

    assert.equal(
      (await request(`agents/${agent.id}`, { cookie: otherCookie })).status,
      404,
    );
    assert.equal(
      (
        await request(`agents/${agent.id}`, {
          method: "PUT",
          body: input,
          cookie: otherCookie,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`agents/${agent.id}`, {
          method: "DELETE",
          cookie: otherCookie,
        })
      ).status,
      404,
    );

    const forProject = (await (
      await request(`agents?projectId=${project.id}`, { cookie })
    ).json()) as { agents: { id: string }[] };

    assert.deepEqual(
      forProject.agents.map((entry) => entry.id),
      [agent.id],
    );
    assert.equal(
      (await request(`agents?projectId=${project.id}`, { cookie: otherCookie }))
        .status,
      404,
    );

    const secondResponse = await request("agents", {
      method: "POST",
      body: { ...input, name: "Second agent" },
      cookie,
    });
    const secondAgent = (await secondResponse.json()) as { id: string };

    async function saveSession(session: Record<string, unknown>) {
      return request("chat/sessions", {
        method: "PUT",
        body: { sessions: [session] },
        cookie,
      });
    }

    const baseSession = {
      id: "agent-chat-1",
      title: "Agent chat",
      projectId: project.id,
      sectionId: null,
      providerId: input.providerId,
      modelId: input.modelId,
    };

    assert.equal(
      (await saveSession({ ...baseSession, id: "agent-chat-none" })).status,
      200,
    );

    const noAgentSubmit = await request("chat", {
      method: "POST",
      body: {
        conversationId: "agent-chat-none",
        messageId: "message-no-agent",
        providerId: input.providerId,
        modelId: input.modelId,
        permissionMode: "promptUnmatched",
        reasoningEffort: provider?.models[0]?.defaultReasoningEffort || "max",
        systemPrompt: "",
        messages: [{ role: "user", text: "Hello" }],
      },
      cookie,
    });

    assert.equal(noAgentSubmit.status, 400);

    assert.equal(
      (await saveSession({ ...baseSession, agentId: agent.id })).status,
      200,
    );

    // Agent selection can still change before the first submission.
    assert.equal(
      (await saveSession({ ...baseSession, agentId: secondAgent.id })).status,
      200,
    );
    assert.equal(
      (await saveSession({ ...baseSession, agentId: agent.id })).status,
      200,
    );

    if (provider) {
      const submitted = await request("chat", {
        method: "POST",
        body: {
          conversationId: "agent-chat-1",
          messageId: "message-with-agent",
          providerId: input.providerId,
          modelId: input.modelId,
          permissionMode: "promptUnmatched",
          reasoningEffort: provider.models[0].defaultReasoningEffort,
          systemPrompt: "",
          messages: [{ role: "user", text: "Hello agent" }],
        },
        cookie,
      });

      assert.equal(submitted.status, 202);

      const sessions = (await (
        await request("chat/sessions", { cookie })
      ).json()) as {
        sessions: {
          id: string;
          agentName?: string;
          providerId: string;
          modelId: string;
        }[];
      };
      const saved = sessions.sessions.find(
        (entry) => entry.id === "agent-chat-1",
      )!;

      assert.equal(saved.agentName, "Reviewer");
      assert.equal(saved.providerId, input.providerId);
      assert.equal(saved.modelId, input.modelId);

      // Locking: a different agent now requires a new chat.
      assert.equal(
        (await saveSession({ ...baseSession, agentId: secondAgent.id })).status,
        409,
      );

      // Editing the agent must not change the started conversation.
      const edited = await request(`agents/${agent.id}`, {
        method: "PUT",
        body: { ...input, name: "Renamed agent", instructions: "Changed" },
        cookie,
      });

      assert.equal(edited.status, 200);

      const afterEdit = (await (
        await request("chat/sessions", { cookie })
      ).json()) as { sessions: { id: string; agentName?: string }[] };

      assert.equal(
        afterEdit.sessions.find((entry) => entry.id === "agent-chat-1")
          ?.agentName,
        "Reviewer",
      );

      // Deleting the agent keeps the conversation and its display name.
      assert.equal(
        (await request(`agents/${agent.id}`, { method: "DELETE", cookie }))
          .status,
        200,
      );

      const afterDelete = (await (
        await request("chat/sessions", { cookie })
      ).json()) as { sessions: { id: string; agentName?: string }[] };

      assert.equal(
        afterDelete.sessions.find((entry) => entry.id === "agent-chat-1")
          ?.agentName,
        "Reviewer",
      );

      const remaining = (await (
        await request(`agents?projectId=${project.id}`, { cookie })
      ).json()) as { agents: { id: string }[] };

      assert.deepEqual(
        remaining.agents.map((entry) => entry.id),
        [secondAgent.id],
      );
    }

    // General chats keep working without an agent.
    const generalSession = {
      id: "general-chat-1",
      title: "General chat",
      projectId: null,
      sectionId: chatsSection.id,
      providerId: input.providerId,
      modelId: input.modelId,
      agentId: secondAgent.id,
    };

    assert.equal((await saveSession(generalSession)).status, 200);

    const generalSessions = (await (
      await request("chat/sessions", { cookie })
    ).json()) as { sessions: { id: string; agentId?: string | null }[] };

    assert.equal(
      generalSessions.sessions.find((entry) => entry.id === "general-chat-1")
        ?.agentId,
      null,
    );
  } finally {
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
});
