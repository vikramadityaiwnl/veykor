import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const folder = mkdtempSync(join(tmpdir(), "veykor-skill-name-"));

process.env["DATABASE_URL"] = join(folder, "test.db");

const { skillsRoute } = await import("../../src/integrations/skills.ts");
const { db } = await import("../../src/db/client.ts");
const { users, sessions, skills } = await import("../../src/db/schema.ts");

const owner = db
  .insert(users)
  .values({ username: "skill-owner" })
  .returning()
  .get();

db.insert(sessions)
  .values({
    id: "skill-owner-session",
    userId: owner.id,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  })
  .run();

db.insert(skills)
  .values({
    id: "locked-name",
    userId: owner.id,
    name: "original-name",
    slug: "original-name",
    description: "Original description",
    instructions: "Original instructions",
    enabled: 0,
  })
  .run();

async function update(body: Record<string, unknown>) {
  return skillsRoute.request("/locked-name", {
    method: "PUT",
    headers: {
      Cookie: "veykor_session=skill-owner-session",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("skill names stay immutable while description and instructions remain editable", async () => {
  try {
    for (const name of ["changed-name", "", null, 42]) {
      const rejected = await update({ name, description: "Must not save" });

      assert.equal(rejected.status, 400);

      const unchanged = await skillsRoute.request("/locked-name", {
        headers: { Cookie: "veykor_session=skill-owner-session" },
      });
      const stored = await unchanged.json();

      assert.equal(stored.name, "original-name");
      assert.equal(stored.description, "Original description");
    }

    const edited = await update({
      description: "Updated description",
      instructions: "Updated instructions",
    });
    const stored = await edited.json();

    assert.equal(edited.status, 200);
    assert.equal(stored.name, "original-name");
    assert.equal(stored.slug, "original-name");
    assert.equal(stored.description, "Updated description");
    assert.equal(stored.instructions, "Updated instructions");

    const compatible = await update({
      name: "original-name",
      description: "Same name accepted",
    });

    assert.equal(compatible.status, 200);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
