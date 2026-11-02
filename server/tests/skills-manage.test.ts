import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DetectedSkillsResponse, SkillDetail } from "@veykor/shared";
import { createSkill, deleteSkill, readSkillDetail, updateSkill, validSkillInput, validSkillName } from "../src/skills/manage.js";

function buildFixtureHome(): string {
  const home = mkdtempSync(join(tmpdir(), "veykor-skills-home-"));

  mkdirSync(join(home, ".agents", "skills", "demo-skill"), { recursive: true });
  writeFileSync(
    join(home, ".agents", "skills", "demo-skill", "SKILL.md"),
    "---\nname: demo-skill\ndescription: Demonstrates skills.\nallowed-tools: Bash\n---\n\nBody here.\n",
  );

  return home;
}

test("skill files roundtrip with frontmatter preserved", () => {
  const home = buildFixtureHome();

  try {
    assert.equal(validSkillName("demo-skill"), true);
    assert.equal(validSkillName("Bad Name!"), false);
    assert.equal(validSkillName(""), false);
    assert.equal(validSkillInput({ description: "d", body: "b" }), true);
    assert.equal(validSkillInput({ description: "", body: "b" }), false);
    assert.equal(validSkillInput({ description: "d", body: "  " }), false);

    const detail = readSkillDetail(home, "agents-skills/demo-skill");
    assert.equal(detail?.name, "demo-skill");
    assert.equal(detail?.description, "Demonstrates skills.");
    assert.equal(detail?.body, "\nBody here.\n");
    assert.ok(detail?.file.startsWith("---\nname: demo-skill\n"));
    assert.equal(readSkillDetail(home, "agents-skills/missing"), null);
    assert.equal(readSkillDetail(home, "agents-skills/../escape"), null);
    assert.equal(readSkillDetail(home, "nope/demo-skill"), null);
    assert.equal(readSkillDetail(home, "noid"), null);

    const created = createSkill(home, {
      name: "fresh-skill",
      description: "Freshly made.",
      body: "Fresh body.\n",
    });
    assert.equal(created?.id, "agents-skills/fresh-skill");
    assert.ok(
      readFileSync(
        join(home, ".agents", "skills", "fresh-skill", "SKILL.md"),
        "utf8",
      ).includes("description: Freshly made."),
    );
    assert.equal(
      createSkill(home, { name: "fresh-skill", description: "x", body: "y" }),
      null,
    );
    assert.equal(
      createSkill(home, { name: "Bad Name!", description: "x", body: "y" }),
      null,
    );

    const updated = updateSkill(home, "agents-skills/demo-skill", {
      name: "demo-skill",
      description: "Updated.",
      body: "New body.\n",
    });
    assert.equal(updated?.description, "Updated.");
    assert.equal(updated?.body, "New body.\n");
    const rewritten = readFileSync(
      join(home, ".agents", "skills", "demo-skill", "SKILL.md"),
      "utf8",
    );
    assert.ok(rewritten.includes("allowed-tools: Bash"));
    assert.ok(rewritten.includes("description: Updated."));
    assert.ok(
      readFileSync(
        join(home, ".agents", "skills", "demo-skill", "SKILL.md.bak"),
        "utf8",
      ).includes("Demonstrates skills."),
    );
    assert.equal(
      updateSkill(home, "agents-skills/missing", {
        name: "missing",
        description: "x",
        body: "y",
      }),
      null,
    );

    const renamed = updateSkill(home, "agents-skills/demo-skill", {
      name: "renamed-skill",
      description: "Updated.",
      body: "New body.\n",
    });
    assert.equal(renamed?.id, "agents-skills/renamed-skill");
    assert.equal(
      existsSync(join(home, ".agents", "skills", "demo-skill")),
      false,
    );
    assert.ok(
      readFileSync(
        join(home, ".agents", "skills", "renamed-skill", "SKILL.md"),
        "utf8",
      ).includes("name: renamed-skill"),
    );

    assert.equal(deleteSkill(home, "agents-skills/renamed-skill"), true);
    assert.equal(deleteSkill(home, "agents-skills/renamed-skill"), false);
    assert.equal(
      existsSync(join(home, ".agents", "skills", "renamed-skill")),
      false,
    );
    assert.equal(
      existsSync(join(home, ".agents", "skills", "renamed-skill.bak")),
      true,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("skills manage endpoints work over the api", async () => {
  const home = buildFixtureHome();
  const folder = mkdtempSync(join(tmpdir(), "veykor-skills-"));
  const port = "31999";
  const origin = `http://localhost:${port}`;
  let child: ChildProcess;
  child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      JWT_SECRET: "skills-test-secret-thirty-two-bytes!!!",
      PORT: port,
      HOME: home,
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
    method = "GET",
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

    const registered = await request(
      "auth/register",
      "",
      { username: "skills-owner", password: "a-long-test-password" },
      "POST",
    );
    assert.equal(registered.status, 200);
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];

    const listed = (await (
      await request("integrations/skills", cookie)
    ).json()) as DetectedSkillsResponse;
    assert.deepEqual(
      listed.sources[0].skills.map((skill) => skill.id),
      ["agents-skills/demo-skill"],
    );

    const fileId = encodeURIComponent("agents-skills/demo-skill");
    assert.equal(
      (await request(`integrations/skills/file?id=${fileId}`, cookie)).status,
      200,
    );
    const detail = (await (
      await request(`integrations/skills/file?id=${fileId}`, cookie)
    ).json()) as SkillDetail;
    assert.equal(detail.body, "\nBody here.\n");
    assert.equal(
      (await request("integrations/skills/file?id=nope%2Fmissing", cookie))
        .status,
      404,
    );

    assert.equal(
      (
        await request(
          "integrations/skills",
          cookie,
          { name: "bad name!" },
          "POST",
        )
      ).status,
      400,
    );
    const createdResponse = await request(
      "integrations/skills",
      cookie,
      { name: "api-skill", description: "Made over api.", body: "Api body.\n" },
      "POST",
    );
    assert.equal(createdResponse.status, 201);
    assert.equal(
      (
        await request(
          "integrations/skills",
          cookie,
          { name: "api-skill", description: "x", body: "y" },
          "POST",
        )
      ).status,
      409,
    );

    const createdId = encodeURIComponent("agents-skills/api-skill");
    assert.equal(
      (
        await request(
          `integrations/skills/file?id=${createdId}`,
          cookie,
          { name: "api-skill", description: "", body: "y" },
          "PUT",
        )
      ).status,
      400,
    );
    const updatedResponse = await request(
      `integrations/skills/file?id=${createdId}`,
      cookie,
      { name: "api-skill", description: "Renamed.", body: "New api body.\n" },
      "PUT",
    );
    assert.equal(updatedResponse.status, 200);
    assert.equal(
      ((await updatedResponse.json()) as SkillDetail).description,
      "Renamed.",
    );

    assert.equal(
      (
        await request(
          "integrations/skills/file?id=nope%2Fmissing",
          cookie,
          undefined,
          "DELETE",
        )
      ).status,
      404,
    );
    const deleted = await request(
      `integrations/skills/file?id=${createdId}`,
      cookie,
      undefined,
      "DELETE",
    );
    assert.equal(deleted.status, 200);
    assert.equal(
      existsSync(join(home, ".agents", "skills", "api-skill.bak")),
      true,
    );

    const relisted = (await (
      await request("integrations/skills", cookie)
    ).json()) as DetectedSkillsResponse;
    assert.deepEqual(
      relisted.sources[0].skills.map((skill) => skill.id),
      ["agents-skills/demo-skill"],
    );
  } finally {
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
    rmSync(folder, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
