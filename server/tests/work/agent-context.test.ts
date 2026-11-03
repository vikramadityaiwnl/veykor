import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
  compileAgentContext,
  agentTurnInput,
} from "../../src/work/agent-context.ts";
import { runMigrations } from "../../src/db/migrate.ts";

const project = { name: "Example project", folder: "/tmp/example" };

const agent = {
  id: "agent",
  name: "Planner",
  description: "Plan implementation work",
  instructions: "",
};

test("identity and project context are included without custom instructions", () => {
  const context = compileAgentContext(agent, project);
  assert.match(context, /version="1"/);
  assert.match(context, /"name": "Planner"/);
  assert.match(context, /Plan implementation work/);
  assert.match(context, /Example project/);
  assert.match(context, /\/tmp\/example/);
  assert.match(context, /answer truthfully/);
  assert.match(context, /Only claim tools and capabilities actually available/);
  assert.equal(compileAgentContext({}, project), "");
});

test("turn context leaves display text intact for text and image-only messages", () => {
  const context = compileAgentContext(
    { ...agent, instructions: "Ask one question at a time." },
    project,
  );
  assert.match(context, /Ask one question at a time/);
  assert.deepEqual(agentTurnInput(context, "Who are you?"), {
    text: `${context}\n\nWho are you?`,
    displayText: "Who are you?",
  });
  assert.equal(agentTurnInput(context, "").displayText, "");
  assert.deepEqual(agentTurnInput("", "General chat"), {
    text: "General chat",
  });
});

test("legacy context is backfilled once from saved agent data and remains immutable", () => {
  const sqlite = new Database(":memory:");

  try {
    runMigrations(sqlite);
    sqlite
      .prepare("INSERT INTO users (id, username) VALUES (1, 'owner')")
      .run();
    sqlite
      .prepare(
        "INSERT INTO projects (id, user_id, name, folder) VALUES ('project', 1, ?, ?)",
      )
      .run(project.name, project.folder);
    sqlite
      .prepare(
        "INSERT INTO chats (id, user_id, project_id, agent_snapshot) VALUES ('chat', 1, 'project', ?)",
      )
      .run(JSON.stringify(agent));
    runMigrations(sqlite);
    const read = () =>
      (
        sqlite
          .prepare("SELECT agent_context FROM chats WHERE id = 'chat'")
          .get() as { agent_context: string }
      ).agent_context;
    const original = read();
    assert.equal(original, compileAgentContext(agent, project));
    sqlite
      .prepare("UPDATE projects SET name = 'Renamed', folder = '/different'")
      .run();
    sqlite
      .prepare("UPDATE chats SET agent_snapshot = ? WHERE id = 'chat'")
      .run(JSON.stringify({ ...agent, name: "Changed" }));
    runMigrations(sqlite);
    assert.equal(read(), original);
  } finally {
    sqlite.close();
  }
});
