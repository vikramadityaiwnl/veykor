import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { defaultPreferences } from "@veykor/shared";
import { runMigrations } from "../../src/db/migrate.ts";
import {
  defaultAgentDefinitions,
  legacyDefaultInstructions,
} from "../../src/work/default-agents.ts";

test("seeds separate defaults and migrates legacy chat sections without losing chats or projects", () => {
  const sqlite = new Database(":memory:");

  try {
    runMigrations(sqlite);
    sqlite
      .prepare(
        "INSERT INTO users (id, username) VALUES (1, 'existing'), (2, 'missing-preferences')",
      )
      .run();
    sqlite.prepare("INSERT INTO preferences (user_id, data) VALUES (1, ?)").run(
      JSON.stringify({
        sections: [
          { id: "recent", title: "Recent", open: true },
          { id: "chats", title: "Chats", open: true },
          { id: "ideas", title: "Ideas", open: false },
        ],
        chatSections: { legacy: "chats" },
      }),
    );
    sqlite
      .prepare(
        "INSERT INTO chats (id, user_id, section_id) VALUES ('legacy-chat', 1, 'chats')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO projects (id, user_id, section_id, name, folder) VALUES ('legacy-project', 1, 'recent', 'Project', '/tmp')",
      )
      .run();

    runMigrations(sqlite);
    runMigrations(sqlite);

    const existing = JSON.parse(
      (
        sqlite
          .prepare("SELECT data FROM preferences WHERE user_id = 1")
          .get() as { data: string }
      ).data,
    );
    assert.deepEqual(existing.sections, [
      { id: "recent", title: "Recent", open: true },
      { id: "ideas", title: "Ideas", open: false },
    ]);
    assert.deepEqual(existing.workSections, [
      { id: "default-projects", title: "Default projects", open: true },
    ]);
    assert.deepEqual(existing.chatSections, { legacy: "recent" });
    assert.deepEqual(
      sqlite
        .prepare("SELECT section_id FROM chats WHERE id = 'legacy-chat'")
        .get(),
      { section_id: "recent" },
    );
    assert.deepEqual(
      sqlite
        .prepare("SELECT section_id FROM projects WHERE id = 'legacy-project'")
        .get(),
      { section_id: "default-projects" },
    );
    assert.deepEqual(
      JSON.parse(
        (
          sqlite
            .prepare("SELECT data FROM preferences WHERE user_id = 2")
            .get() as { data: string }
        ).data,
      ),
      { ...defaultPreferences(), agentsSeeded: true },
    );
    assert.deepEqual(
      (
        sqlite
          .prepare("SELECT data FROM agents WHERE user_id = 2")
          .all() as Array<{ data: string }>
      ).map((row) => JSON.parse(row.data).name),
      ["Team Lead", "Coder", "Reviewer", "GitHub Manager"],
    );
  } finally {
    sqlite.close();
  }
});

test("upgrades untouched default agents without touching customized ones", () => {
  const sqlite = new Database(":memory:");

  try {
    runMigrations(sqlite);
    sqlite
      .prepare("INSERT INTO users (id, username) VALUES (1, 'owner')")
      .run();

    const lead = defaultAgentDefinitions[0];
    const coder = defaultAgentDefinitions[1];
    const manager = defaultAgentDefinitions[3];

    sqlite
      .prepare("INSERT INTO agents (id, user_id, data) VALUES ('legacy', 1, ?)")
      .run(
        JSON.stringify({
          ...lead,
          modelId: "",
          providerId: "",
          reasoningEffort: "",
          permission: "approved",
        }),
      );
    sqlite
      .prepare("INSERT INTO agents (id, user_id, data) VALUES ('custom', 1, ?)")
      .run(JSON.stringify({ ...coder, modelId: "custom-model" }));
    sqlite
      .prepare(
        "INSERT INTO agents (id, user_id, data) VALUES ('legacy-manager', 1, ?)",
      )
      .run(
        JSON.stringify({
          ...manager,
          description: "Owns branches, commits, pull requests, and releases.",
          instructions: legacyDefaultInstructions["GitHub Manager"],
          modelId: "",
          providerId: "",
          reasoningEffort: "",
        }),
      );

    runMigrations(sqlite);

    const upgraded = JSON.parse(
      (
        sqlite.prepare("SELECT data FROM agents WHERE id = 'legacy'").get() as {
          data: string;
        }
      ).data,
    );
    assert.equal(upgraded.modelId, "muse-wonder-1.0");
    assert.equal(upgraded.providerId, "meta");
    assert.equal(upgraded.reasoningEffort, "high");
    assert.equal(upgraded.permission, "full-access");
    assert.equal(upgraded.instructions, lead.instructions);

    const custom = JSON.parse(
      (
        sqlite.prepare("SELECT data FROM agents WHERE id = 'custom'").get() as {
          data: string;
        }
      ).data,
    );
    assert.equal(custom.modelId, "custom-model");
    assert.equal(custom.reasoningEffort, coder.reasoningEffort);

    const refreshed = JSON.parse(
      (
        sqlite
          .prepare("SELECT data FROM agents WHERE id = 'legacy-manager'")
          .get() as { data: string }
      ).data,
    );
    assert.equal(refreshed.description, manager.description);
    assert.equal(refreshed.instructions, manager.instructions);
    assert.match(refreshed.instructions, /## Commits/);
    assert.equal(refreshed.modelId, "muse-wonder-1.0");
    assert.equal(refreshed.autoAddToNewProjects, true);
  } finally {
    sqlite.close();
  }
});
