import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import type { Connection } from "@muse-code/sdk";
import type { AgentDefinition } from "@veykor/shared";

const folder = mkdtempSync(join(tmpdir(), "veykor-team-flow-"));

process.env["DATABASE_URL"] = join(folder, "team.db");

const { readTeamMessage } = await import("../../src/teams/team-messages.ts");
const { db } = await import("../../src/db/client.ts");
const { users, sessions, chats, agents, projects, teamJobs, mcpServers } =
  await import("../../src/db/schema.ts");
const { museHost } = await import("../../src/muse/muse-host.ts");
const { chatRoute } = await import("../../src/chats/chats.ts");
const { buildSessionMcp } =
  await import("../../src/integrations/integrations.ts");
const { teamRoute, teamMcpRoute } = await import("../../src/teams/teams.ts");
const {
  delegateTeamMember,
  beginTeamDeletion,
  messageTeamMember,
  ownedChat,
  runTeamTurn,
  stopTeamMember,
  teamSnapshot,
  sessionMcp,
  shareInterruption,
  pumpTeamJobs,
  readTeamChat,
  updateTeamTodos,
  queueTeamInput,
  removeQueuedTeamInput,
} = await import("../../src/teams/team-runtime.ts");

const owner = db
  .insert(users)
  .values({ username: "team-owner" })
  .returning()
  .get();
const stranger = db
  .insert(users)
  .values({ username: "team-stranger" })
  .returning()
  .get();

for (const user of [owner, stranger]) {
  db.insert(sessions)
    .values({
      id: `user-${user.id}`,
      userId: user.id,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    })
    .run();
}

const profile: AgentDefinition = {
  id: "planner",
  name: "Planner",
  description: "Plan the work",
  instructions: "Provide a plan",
  avatar: "",
  modelId: "",
  providerId: "",
  reasoningEffort: "",
  permission: "full-access",
};

for (const id of ["planner", "tester", "unassigned"]) {
  db.insert(agents)
    .values({
      id,
      userId: owner.id,
      data: JSON.stringify({ ...profile, id, name: id }),
    })
    .run();
}

db.insert(projects)
  .values({
    id: "project",
    userId: owner.id,
    name: "Project",
    folder,
    agentIds: JSON.stringify(["planner", "tester"]),
  })
  .run();
db.insert(chats)
  .values({
    id: "main",
    userId: owner.id,
    projectId: "project",
    title: "A shared task",
    museSessionId: "main-session",
    teamToken: "main-secret",
  })
  .run();

const originalConnection = museHost.connection;
const originalSubscribe = museHost.subscribe;
const originalSupports = museHost.supportsSessionMcp;
museHost.supportsSessionMcp = async () => true;
const listeners = new Map<
  string,
  (event: { method: string; params: Record<string, unknown> }) => void
>();
const loadedSessions = new Set<string>();
const modes = new Map<string, string>([["main-session", "promptUnmatched"]]);
const held = new Set<string>();
const turns = new Map<string, string>();
const histories = new Map<string, Record<string, unknown>[]>();
const inputs: { sessionId: string; text: string; task: string }[] = [];
const steers: { sessionId: string; text: string }[] = [];
let sequence = 0;

let rejectStartFor = "";

function finish(sessionId: string, terminal = "completed") {
  const turnId = turns.get(sessionId);
  const notify = listeners.get(sessionId);

  if (!turnId || !notify) {
    return;
  }

  notify({
    method: "item/completed",
    params: {
      item: {
        kind: "agentMessage",
        itemId: `answer-${turnId}`,
        turnId,
        text: `Result from ${sessionId}`,
      },
    },
  });
  notify({
    method: "turn/completed",
    params: { turnId, terminal, durationMs: 1 },
  });
  turns.delete(sessionId);
}

museHost.subscribe = (sessionId, listener) => {
  listeners.set(sessionId, listener);

  return () => {
    listeners.delete(sessionId);
  };
};
museHost.connection = async () =>
  ({
    command: async (method: string, params: Record<string, unknown>) => {
      const sessionId = String(params.sessionId ?? "");

      if (method === "session/start") {
        const id = `member-${++sequence}`;

        held.add(id);
        loadedSessions.add(id);
        return { session: { sessionId: id } };
      }

      if (method === "session/setApprovalMode") {
        modes.set(sessionId, String(params.mode));
      }

      if (method === "session/resume") {
        loadedSessions.add(sessionId);
        return {
          session: {
            approvalMode: { mode: modes.get(sessionId) ?? "promptUnmatched" },
          },
          history: { items: histories.get(sessionId) ?? [] },
        };
      }

      if (method === "turn/start") {
        if (!loadedSessions.has(sessionId)) {
          throw new Error("Session is not loaded on this host");
        }

        if (sessionId === rejectStartFor) {
          rejectStartFor = "";
          throw new Error("Manual turn admission failed");
        }

        const turnId = `turn-${++sequence}`;
        const input = params.input as { text?: string }[];

        turns.set(sessionId, turnId);
        const text = input[0]?.text ?? "";
        const message = readTeamMessage(
          text.slice(text.lastIndexOf('<veykor-team-message version="1">')),
        );

        inputs.push({ sessionId, text, task: message?.text ?? text });
        histories.set(sessionId, [
          ...(histories.get(sessionId) ?? []),
          {
            kind: "userMessage",
            itemId: `user-${turnId}`,
            turnId,
            text: input[0]?.text ?? "",
            displayText: params.displayText,
            recordedAt: new Date().toISOString(),
          },
        ]);
        queueMicrotask(() => {
          listeners.get(sessionId)?.({
            method: "turn/started",
            params: { turnId },
          });

          if (!held.has(sessionId)) {
            setImmediate(() => finish(sessionId));
          }
        });
        return { turnId };
      }

      if (method === "turn/steer") {
        steers.push({
          sessionId,
          text: (params.input as { text: string }[])[0]?.text ?? "",
        });
      }

      if (method === "turn/cancel") {
        finish(sessionId, "cancelled");
      }

      return {};
    },
    request: async (method: string) =>
      method === "approval/listPending" ? { approvals: [] } : { events: [] },
  }) as unknown as Connection;

async function eventually(predicate: () => boolean) {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.ok(predicate(), "Expected the queued operation to finish");
}

function cookie(userId = owner.id) {
  return { Cookie: `veykor_session=user-${userId}` };
}

test("linked sessions coordinate, share interruptions, isolate ownership and preserve the parent chat", async () => {
  const main = ownedChat(owner.id, "main")!;

  try {
    assert.deepEqual(teamSnapshot(main).events, []);
    const releaseDeletion = beginTeamDeletion(main);

    await assert.rejects(
      delegateTeamMember(main, "planner", "A racing task"),
      /being deleted/,
    );
    await assert.rejects(
      runTeamTurn(main, "A racing turn", [], () => {}),
      /being deleted/,
    );
    assert.throws(
      () => messageTeamMember(main, "other", "A racing message"),
      /being deleted/,
    );
    releaseDeletion();

    db.insert(mcpServers)
      .values({
        id: "collision",
        userId: owner.id,
        name: "veykor-team",
        transport: "http",
        config: JSON.stringify({
          url: "https://example.test/mcp",
          headers: {},
        }),
      })
      .run();
    const external = buildSessionMcp(owner.id);
    const runtime = sessionMcp({
      ...main,
      mcpSnapshot: JSON.stringify(external.snapshot),
    });

    assert.equal(runtime["veykor-team"].transport, "streamableHttp");
    assert.equal(
      (runtime["veykor-team"] as { url: string }).url,
      "https://example.test/mcp",
    );
    assert.equal(runtime["veykor-team-internal"].transport, "streamableHttp");

    assert.equal(
      (await teamRoute.request("/main", { headers: cookie(stranger.id) }))
        .status,
      404,
    );
    assert.equal(
      (
        await teamMcpRoute.request("/main", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer wrong",
          },
          body: JSON.stringify({ id: 1, method: "tools/list" }),
        })
      ).status,
      401,
    );
    await assert.rejects(
      delegateTeamMember(main, "unassigned", "Do work"),
      /available/,
    );

    const planner = await delegateTeamMember(main, "planner", "Plan the task");
    const plannerRow = ownedChat(owner.id, planner.id)!;

    await eventually(() => turns.has(plannerRow.museSessionId));
    assert.equal(plannerRow.parentChatId, "main");
    assert.equal(modes.get(plannerRow.museSessionId), "promptUnmatched");
    assert.ok(sessionMcp(plannerRow)["veykor-team"]);
    assert.ok(
      inputs
        .find((input) => input.sessionId === plannerRow.museSessionId)
        ?.text.includes("Main chat: main"),
    );
    const planningContext = inputs.find(
      (input) => input.sessionId === plannerRow.museSessionId,
    )!.text;

    assert.ok(planningContext.includes('"isSelf":true'));
    assert.ok(planningContext.includes('"name":"tester"'));
    assert.ok(
      planningContext.includes("delegate independent testing automatically"),
    );

    const toolResponse = await teamMcpRoute.request(`/${planner.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${plannerRow.teamToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "team_delegate",
          arguments: { agentId: "tester", task: "Test the plan" },
        },
      }),
    });
    const toolResult = await toolResponse.json();

    assert.equal(toolResult.result.isError, undefined);
    const tester = JSON.parse(toolResult.result.content[0].text) as {
      id: string;
    };
    const testerRow = ownedChat(owner.id, tester.id)!;

    await eventually(() => turns.has(testerRow.museSessionId));
    assert.equal(testerRow.parentChatId, "main");
    assert.equal(testerRow.delegatedById, planner.id);
    assert.equal(teamSnapshot(main).members.length, 3);

    const listed = await chatRoute.request("/", { headers: cookie() });

    assert.deepEqual(
      (await listed.json()).map((entry: { id: string }) => entry.id),
      ["main"],
    );
    assert.equal(
      (
        await chatRoute.request("/main", {
          method: "DELETE",
          headers: cookie(),
        })
      ).status,
      409,
    );

    const firstTesterTurn = turns.get(testerRow.museSessionId);
    const queued = messageTeamMember(
      plannerRow,
      tester.id,
      "Use these test cases",
    );
    const reassigned = await Promise.all([
      delegateTeamMember(
        plannerRow,
        "tester",
        "Retest the Python implementation",
      ),
      delegateTeamMember(
        plannerRow,
        "tester",
        "Retest the Java implementation",
      ),
    ]);

    assert.ok(
      reassigned.every(
        (member) => member.id === tester.id && member.status === "queued",
      ),
    );
    assert.equal(teamSnapshot(main).members.length, 3);
    assert.equal(turns.get(testerRow.museSessionId), firstTesterTurn);
    assert.equal(
      db
        .select()
        .from(teamJobs)
        .where(eq(teamJobs.id, `${queued.id}:${tester.id}`))
        .get()?.status,
      "pending",
    );
    assert.ok(
      !steers.some((entry) => entry.text.includes("Use these test cases")),
    );

    for (const task of [
      "Use these test cases",
      "Retest the Python implementation",
      "Retest the Java implementation",
    ]) {
      finish(testerRow.museSessionId);
      await eventually(() =>
        inputs.some(
          (input) =>
            input.sessionId === testerRow.museSessionId && input.task === task,
        ),
      );
      assert.ok(turns.has(testerRow.museSessionId));
    }

    const legacy = db
      .insert(chats)
      .values({
        ...testerRow,
        id: "legacy-tester",
        museSessionId: "legacy-tester-session",
        createdAt: "9999-01-01T00:00:00.000Z",
      })
      .returning()
      .get();

    histories.set(legacy.museSessionId, [
      {
        kind: "userMessage",
        itemId: "old-internal",
        text: "Team update #15 (started) from session 1234-abcd:\nTest Java",
      },
      {
        kind: "agentMessage",
        itemId: "old-report",
        text: "Earlier Java report",
      },
    ]);
    assert.equal(teamSnapshot(main).members.length, 3);
    const combined = await readTeamChat(testerRow);
    const legacyRoute = await chatRoute.request("/legacy-tester", {
      headers: cookie(),
    });
    const legacyDetail = await legacyRoute.json();

    assert.equal(legacyDetail.chat.id, tester.id);
    assert.ok(
      legacyDetail.items.some(
        (item: { text: string }) => item.text === "Earlier Java report",
      ),
    );

    assert.ok(
      combined.items.some((item) => item.text === "Earlier Java report"),
    );
    assert.ok(
      !combined.items.some((item) => item.text.includes("Team update #")),
    );
    assert.ok(
      !combined.items.some(
        (item) =>
          item.kind === "userMessage" &&
          item.text.includes("veykor-team-message"),
      ),
    );

    await shareInterruption(plannerRow, "The user changed the plan");
    assert.ok(
      steers.some(
        (entry) =>
          entry.sessionId === testerRow.museSessionId &&
          entry.text.includes("The user changed the plan"),
      ),
    );

    await stopTeamMember(plannerRow, turns.get(plannerRow.museSessionId)!);
    await eventually(
      () => ownedChat(owner.id, planner.id)?.teamStatus === "stopped",
    );
    assert.ok(
      steers.some(
        (entry) =>
          entry.sessionId === testerRow.museSessionId &&
          entry.text.includes("user stopped"),
      ),
    );

    const before = db
      .select()
      .from(teamJobs)
      .where(eq(teamJobs.targetId, planner.id))
      .all().length;

    messageTeamMember(testerRow, planner.id, "Please resume later");
    assert.equal(
      db.select().from(teamJobs).where(eq(teamJobs.targetId, planner.id)).all()
        .length,
      before + 1,
    );
    assert.equal(ownedChat(owner.id, planner.id)?.teamStatus, "stopped");

    finish(testerRow.museSessionId);
    await eventually(() =>
      teamSnapshot(main).events.some(
        (event) => event.senderId === tester.id && event.kind === "completed",
      ),
    );
    await eventually(() =>
      [...inputs, ...steers].some(
        (input) =>
          input.sessionId === "main-session" &&
          input.text.includes(`Result from ${testerRow.museSessionId}`),
      ),
    );
    assert.ok(
      teamSnapshot(main).events.some((event) => event.kind === "interrupted"),
    );

    rejectStartFor = plannerRow.museSessionId;
    await assert.rejects(
      runTeamTurn(
        ownedChat(owner.id, planner.id)!,
        "Resume planning",
        [],
        () => {},
      ),
      /Manual turn admission failed/,
    );
    assert.equal(ownedChat(owner.id, planner.id)?.teamStatus, "failed");
    assert.ok(
      teamSnapshot(main).events.some(
        (event) =>
          event.senderId === planner.id &&
          event.kind === "failed" &&
          event.text.includes("Manual turn admission failed"),
      ),
    );
    await eventually(() =>
      [...inputs, ...steers].some(
        (input) =>
          input.sessionId === "main-session" &&
          input.text.includes("Manual turn admission failed"),
      ),
    );

    updateTeamTodos(main, [
      { text: "Plan implementation", status: "completed" },
    ]);
    updateTeamTodos(plannerRow, [
      { text: "Check edge cases", status: "in_progress" },
    ]);
    const lists = teamSnapshot(main).members;
    assert.equal(
      lists.find((member) => member.id === main.id)?.todos[0].text,
      "Plan implementation",
    );
    assert.equal(
      lists.find((member) => member.id === planner.id)?.todos[0].text,
      "Check edge cases",
    );
    updateTeamTodos(plannerRow, []);
    assert.equal(
      teamSnapshot(main).members.find((member) => member.id === planner.id)
        ?.todos.length,
      0,
    );
    assert.equal(
      teamSnapshot(main).members.find((member) => member.id === main.id)?.todos
        .length,
      1,
    );
    const queuedInput = queueTeamInput(plannerRow, "Queued user follow-up", []);
    assert.equal(
      teamSnapshot(main).members.find((member) => member.id === planner.id)
        ?.queuedMessages[0].text,
      "Queued user follow-up",
    );
    assert.equal(removeQueuedTeamInput(main, queuedInput.id), false);
    assert.equal(removeQueuedTeamInput(plannerRow, queuedInput.id), true);
    assert.equal(removeQueuedTeamInput(plannerRow, queuedInput.id), false);

    const outsider = db
      .insert(chats)
      .values({
        id: "other-team",
        userId: owner.id,
        museSessionId: "other-session",
      })
      .returning()
      .get();

    assert.throws(
      () => messageTeamMember(plannerRow, outsider.id, "No access"),
      /another member/,
    );

    const denied = await teamMcpRoute.request(`/${planner.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${plannerRow.teamToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "team_read_session",
          arguments: { memberId: outsider.id },
        },
      }),
    });

    assert.equal((await denied.json()).result.isError, true);
    await eventually(() => !turns.has("main-session"));
  } finally {
    for (const sessionId of turns.keys()) {
      finish(sessionId, "cancelled");
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    museHost.connection = originalConnection;
    museHost.subscribe = originalSubscribe;
    museHost.supportsSessionMcp = originalSupports;
    rmSync(folder, { recursive: true, force: true });
  }
});
