import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { defaultPreferences } from "@veykor/shared";
import { runMigrations } from "../../src/db/migrate.ts";

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
      defaultPreferences(),
    );
  } finally {
    sqlite.close();
  }
});
