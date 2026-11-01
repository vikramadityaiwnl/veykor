import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DetectedSkillsResponse, McpDetectedResponse, McpServer, McpServersResponse } from "@veykor/shared";
import { normalizeDetectedEntry, readDetectedEntry, removeDetectedEntry, scanDetectedServers } from "../src/mcp/detect.js";
import { scanDetectedSkills } from "../src/skills/detect.js";

function buildFixtureHome(): string {
  const home = mkdtempSync(join(tmpdir(), "veykor-detect-home-"));

  mkdirSync(join(home, ".cursor"), { recursive: true });
  writeFileSync(
    join(home, ".cursor", "mcp.json"),
    JSON.stringify({
      mcpServers: {
        Docs: {
          command: "npx",
          args: ["-y", "docs-server"],
          env: { API_KEY: "key" },
        },
        Remote: { type: "streamable-http", url: "https://example.com/mcp" },
        Broken: { command: "", url: "not-a-url" },
      },
    }),
  );

  writeFileSync(
    join(home, ".claude.json"),
    JSON.stringify({
      projects: {
        "/work/shop": {
          mcpServers: {
            Shop: { command: "/bin/shop-mcp", args: ["--fast"] },
          },
        },
      },
    }),
  );

  mkdirSync(join(home, ".codeium", "windsurf"), { recursive: true });
  writeFileSync(join(home, ".codeium", "windsurf", "mcp_config.json"), "{oops");

  mkdirSync(join(home, ".agents", "skills", "demo-skill"), { recursive: true });
  writeFileSync(
    join(home, ".agents", "skills", "demo-skill", "SKILL.md"),
    "---\nname: demo-skill\ndescription: Demonstrates skills.\n---\n\nBody.\n",
  );
  mkdirSync(join(home, ".agents", "skills", "empty-dir"), { recursive: true });

  mkdirSync(join(home, ".claude", "skills", "plain"), { recursive: true });
  writeFileSync(
    join(home, ".claude", "skills", "plain", "SKILL.md"),
    "No frontmatter.\n",
  );

  return home;
}

test("detectors normalize entries and skip malformed files", () => {
  const home = buildFixtureHome();

  try {
    assert.deepEqual(
      normalizeDetectedEntry("Docs", {
        command: "npx",
        args: ["-y", "docs-server"],
        env: { API_KEY: "key" },
      }),
      {
        name: "Docs",
        transport: "stdio",
        command: "npx",
        args: ["-y", "docs-server"],
        env: { API_KEY: "key" },
        url: "",
        headers: {},
        enabled: true,
      },
    );
    assert.equal(
      normalizeDetectedEntry("Bare", { url: "https://example.com/sse" })
        ?.transport,
      "sse",
    );
    assert.equal(
      normalizeDetectedEntry("Typed", {
        type: "http",
        url: "https://example.com/mcp",
      })?.transport,
      "http",
    );
    assert.equal(normalizeDetectedEntry("Broken", { command: "" }), null);
    assert.equal(normalizeDetectedEntry("   ", { command: "x" }), null);

    const sources = scanDetectedServers(home);
    assert.deepEqual(
      sources.map((source) => source.id),
      ["claude-code", "cursor"],
    );

    const cursor = sources.find((source) => source.id === "cursor")!;
    assert.equal(cursor.label, "Cursor");
    assert.deepEqual(
      cursor.entries.map((entry) => entry.name),
      ["Docs", "Remote"],
    );
    assert.deepEqual(cursor.entries[0].input.args, ["-y", "docs-server"]);

    const code = sources.find((source) => source.id === "claude-code")!;
    assert.equal(code.entries[0].key, "/work/shop::Shop");

    const skills = scanDetectedSkills(home);
    assert.deepEqual(
      skills.map((source) => source.id),
      ["agents-skills", "claude-skills"],
    );
    assert.deepEqual(skills[0].skills, [
      {
        name: "demo-skill",
        description: "Demonstrates skills.",
        path: join(home, ".agents", "skills", "demo-skill"),
      },
    ]);
    assert.deepEqual(skills[1].skills[0].name, "plain");
    assert.equal(skills[1].skills[0].description, "");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("detected entries can be re-read and removed with a backup", () => {
  const home = buildFixtureHome();

  try {
    const entry = readDetectedEntry(home, "cursor", "Docs");
    assert.equal(entry?.transport, "stdio");
    assert.equal(entry?.env.API_KEY, "key");
    assert.equal(readDetectedEntry(home, "cursor", "Missing"), null);
    assert.equal(readDetectedEntry(home, "nope", "Docs"), null);

    const file = join(home, ".cursor", "mcp.json");
    assert.equal(removeDetectedEntry(home, "cursor", "Docs"), true);
    assert.equal(removeDetectedEntry(home, "cursor", "Docs"), false);

    const backup = `${file}.bak`;
    assert.equal(existsSync(backup), true);
    assert.ok(readFileSync(backup, "utf8").includes('"Docs"'));

    const remaining = JSON.parse(readFileSync(file, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    assert.deepEqual(Object.keys(remaining.mcpServers).sort(), [
      "Broken",
      "Remote",
    ]);

    const nested = join(home, ".claude.json");
    assert.equal(
      removeDetectedEntry(home, "claude-code", "/work/shop::Shop"),
      true,
    );
    const projects = JSON.parse(readFileSync(nested, "utf8")) as {
      projects: Record<string, { mcpServers: Record<string, unknown> }>;
    };
    assert.deepEqual(projects.projects["/work/shop"].mcpServers, {});
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("detection import and remove work over the api", async () => {
  const home = buildFixtureHome();
  const folder = mkdtempSync(join(tmpdir(), "veykor-detect-"));
  const port = "31998";
  const origin = `http://localhost:${port}`;
  let child: ChildProcess;
  child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      JWT_SECRET: "detect-test-secret-thirty-two-bytes!!!!",
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

    assert.equal((await request("mcp/detected")).status, 401);
    assert.equal((await request("integrations/skills")).status, 401);

    const registered = await request(
      "auth/register",
      "",
      { username: "detect-owner", password: "a-long-test-password" },
      "POST",
    );
    assert.equal(registered.status, 200);
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];

    const detected = (await (
      await request("mcp/detected", cookie)
    ).json()) as McpDetectedResponse;
    assert.deepEqual(
      detected.sources.map((source) => source.id),
      ["claude-code", "cursor"],
    );
    assert.ok(
      detected.sources.every((source) =>
        source.servers.every((server) => !server.imported),
      ),
    );

    const skills = (await (
      await request("integrations/skills", cookie)
    ).json()) as DetectedSkillsResponse;
    assert.deepEqual(
      skills.sources.map((source) => source.id),
      ["agents-skills", "claude-skills"],
    );

    assert.equal(
      (
        await request(
          "mcp/detected/import",
          cookie,
          { sourceId: "cursor" },
          "POST",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "mcp/detected/import",
          cookie,
          { sourceId: "cursor", serverKey: "Missing" },
          "POST",
        )
      ).status,
      404,
    );

    const importedResponse = await request(
      "mcp/detected/import",
      cookie,
      { sourceId: "cursor", serverKey: "Docs" },
      "POST",
    );
    assert.equal(importedResponse.status, 201);
    const imported = (await importedResponse.json()) as McpServer;
    assert.equal(imported.name, "Docs");
    assert.equal(imported.command, "npx");

    const relisted = (await (
      await request("mcp/detected", cookie)
    ).json()) as McpDetectedResponse;
    const docs = relisted.sources
      .find((source) => source.id === "cursor")!
      .servers.find((server) => server.key === "Docs")!;
    assert.equal(docs.imported, true);

    assert.equal(
      (
        await request(
          "mcp/detected/import",
          cookie,
          { sourceId: "cursor", serverKey: "Docs" },
          "POST",
        )
      ).status,
      409,
    );

    const managed = (await (
      await request("mcp", cookie)
    ).json()) as McpServersResponse;
    assert.equal(managed.servers.length, 1);

    const removed = await request(
      "mcp/detected/remove",
      cookie,
      { sourceId: "cursor", serverKey: "Remote" },
      "POST",
    );
    assert.equal(removed.status, 200);
    assert.equal(
      (
        await request(
          "mcp/detected/remove",
          cookie,
          { sourceId: "cursor", serverKey: "Remote" },
          "POST",
        )
      ).status,
      404,
    );
    assert.equal(existsSync(join(home, ".cursor", "mcp.json.bak")), true);

    const afterRemove = (await (
      await request("mcp/detected", cookie)
    ).json()) as McpDetectedResponse;
    assert.deepEqual(
      afterRemove.sources
        .find((source) => source.id === "cursor")!
        .servers.map((server) => server.key),
      ["Docs"],
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
