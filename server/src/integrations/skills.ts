import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, asc, eq } from "drizzle-orm";
import {
  deriveSkillSlug,
  emptySkillList,
  skillValidationError,
} from "@veykor/shared";
import type {
  ChatSkillsResponse,
  CreateSkillRequest,
  SkillDetail,
  SkillSummary,
  UpdateSkillRequest,
} from "@veykor/shared";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import { db } from "../db/client.js";
import { chats, skills } from "../db/schema.js";
import { museHost, museBinary } from "../muse/muse-host.js";
import { workspaceFor } from "../muse/chat-service.js";

type SkillRow = typeof skills.$inferSelect;

function nowIso(): string {
  return new Date().toISOString();
}

function skillDir(userId: number, slug: string): string {
  return join(workspaceFor(userId), ".agents", "skills", slug);
}

function insideWorkspace(userId: number, path: string): boolean {
  const root = resolve(workspaceFor(userId)) + sep;

  return resolve(path).startsWith(root);
}

export function renderSkillFile(input: {
  slug: string;
  name: string;
  description: string;
  instructions: string;
}): string {
  return (
    `---\nname: ${input.slug}\ndescription: ${input.description}\n---\n\n` +
    `# ${input.name}\n\n${input.instructions}\n`
  );
}

function validatorError(dir: string): string {
  let output = "";

  try {
    const result = spawnSync(
      museBinary(),
      ["skills", "validate", dir, "--json"],
      { encoding: "utf8", timeout: 30000 },
    );

    output = (result.stdout ?? "").toString();
  } catch {
    return "Muse is not installed on the server.";
  }

  try {
    const parsed = JSON.parse(output) as {
      valid?: unknown;
      diagnostics?: Array<{ message?: unknown }>;
    };

    if (parsed.valid === true) {
      return "";
    }

    const first = parsed.diagnostics?.find(
      (entry) => typeof entry.message === "string",
    )?.message;

    return typeof first === "string" && first !== ""
      ? first
      : "That skill does not follow the skills convention.";
  } catch {
    return "Unable to validate the skill.";
  }
}

function writeSkillFiles(
  userId: number,
  row: SkillRow,
  options: { validate: boolean },
): { error: string; previous: string | null } {
  const dir = skillDir(userId, row.slug ?? "");

  if (!insideWorkspace(userId, dir)) {
    return { error: "That skill id is invalid.", previous: null };
  }

  const file = join(dir, "SKILL.md");
  const previous = existsSync(file) ? readFileSync(file, "utf8") : null;

  mkdirSync(dir, { recursive: true });
  writeFileSync(
    file,
    renderSkillFile({
      slug: row.slug ?? "",
      name: row.name ?? "",
      description: row.description ?? "",
      instructions: row.instructions ?? "",
    }),
  );

  if (!options.validate) {
    return { error: "", previous };
  }

  const error = validatorError(dir);

  if (error === "") {
    return { error: "", previous };
  }

  if (previous === null) {
    rmSync(dir, { recursive: true, force: true });
  } else {
    writeFileSync(file, previous);
  }

  return { error, previous };
}

function removeSkillFiles(userId: number, slug: string): void {
  const dir = skillDir(userId, slug);

  if (insideWorkspace(userId, dir) && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function syncAccountSkills(userId: number): void {
  const rows = db.select().from(skills).where(eq(skills.userId, userId)).all();

  const enabled = new Map(
    rows
      .filter((row) => (row.enabled ?? 1) === 1)
      .map((row) => [row.slug ?? "", row]),
  );

  const root = join(workspaceFor(userId), ".agents", "skills");

  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const row = rows.find((candidate) => candidate.slug === entry.name);

      if (row && !enabled.has(entry.name)) {
        removeSkillFiles(userId, entry.name);
      }
    }
  }

  for (const row of enabled.values()) {
    writeSkillFiles(userId, row, { validate: false });
  }
}

export function toSkillSummary(row: SkillRow): SkillSummary {
  return {
    id: row.id,
    slug: row.slug ?? "",
    name: row.name ?? "",
    description: row.description ?? "",
    enabled: (row.enabled ?? 1) === 1,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

export function toSkillDetail(row: SkillRow): SkillDetail {
  return { ...toSkillSummary(row), instructions: row.instructions ?? "" };
}

export function readSkill(userId: number, id: string): SkillRow | undefined {
  return db
    .select()
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.userId, userId)))
    .get();
}

function slugTaken(userId: number, slug: string, exceptId?: string): boolean {
  const rows = db.select().from(skills).where(eq(skills.userId, userId)).all();

  return rows.some((row) => row.slug === slug && row.id !== exceptId);
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const parsed = (await c.req.json()) as unknown;

    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to empty input
  }

  return {};
}

export const skillsRoute = new Hono<AuthEnv>();

skillsRoute.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

skillsRoute.get("/", requireAuth, (c) => {
  const rows = db
    .select()
    .from(skills)
    .where(eq(skills.userId, c.get("user").id))
    .orderBy(asc(skills.slug))
    .all();

  return c.json({
    ...emptySkillList(),
    skills: rows.map(toSkillSummary),
  });
});

skillsRoute.post("/", requireAuth, async (c) => {
  const body = await readJson(c);
  const input = body as Partial<CreateSkillRequest>;

  const validationError = skillValidationError(input, { partial: false });

  if (validationError !== "") {
    return c.json({ error: validationError }, 400);
  }

  const userId = c.get("user").id;
  const slug = deriveSkillSlug(input.name);

  if (slug === null) {
    return c.json(
      { error: "Give the skill a name using letters and numbers." },
      400,
    );
  }

  if (slugTaken(userId, slug)) {
    return c.json({ error: "Another skill already uses that name." }, 409);
  }

  const id = randomUUID();
  const stamp = nowIso();
  const enabled = input.enabled === false ? 0 : 1;

  const values = {
    id,
    userId,
    slug,
    name: (input.name ?? "").trim(),
    description: (input.description ?? "").trim(),
    instructions: (input.instructions ?? "").trim(),
    enabled,
    createdAt: stamp,
    updatedAt: stamp,
  };

  try {
    db.insert(skills).values(values).run();
  } catch {
    return c.json({ error: "Another skill already uses that name." }, 409);
  }

  const row = readSkill(userId, id);

  if (!row) {
    return c.json({ error: "Unable to save the skill." }, 500);
  }

  if (enabled === 1) {
    const written = writeSkillFiles(userId, row, { validate: true });

    if (written.error !== "") {
      db.delete(skills)
        .where(and(eq(skills.id, id), eq(skills.userId, userId)))
        .run();

      return c.json({ error: written.error }, 400);
    }
  }

  return c.json(toSkillDetail(row), 201);
});

skillsRoute.get("/chat/:chatId", requireAuth, async (c) => {
  const row = db
    .select()
    .from(chats)
    .where(
      and(
        eq(chats.id, c.req.param("chatId")),
        eq(chats.userId, c.get("user").id),
      ),
    )
    .get();

  if (!row) {
    return c.json({ error: "Chat not found" }, 404);
  }

  try {
    const connection = await museHost.connection();
    const listed = (await connection.command("skill/list", {
      sessionId: row.museSessionId,
    })) as {
      skills?: Array<{
        selector?: unknown;
        displayName?: unknown;
        description?: unknown;
        source?: unknown;
      }>;
    };

    const response: ChatSkillsResponse = {
      skills: Array.isArray(listed.skills)
        ? listed.skills.map((entry) => ({
            selector: typeof entry.selector === "string" ? entry.selector : "",
            displayName:
              typeof entry.displayName === "string" ? entry.displayName : "",
            description:
              typeof entry.description === "string" ? entry.description : "",
            source: typeof entry.source === "string" ? entry.source : "",
          }))
        : [],
    };

    return c.json(response);
  } catch {
    return c.json({ error: "Unable to list the chat skills." }, 502);
  }
});

skillsRoute.get("/:id", requireAuth, (c) => {
  const row = readSkill(c.get("user").id, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json(toSkillDetail(row));
});

skillsRoute.put("/:id", requireAuth, async (c) => {
  const userId = c.get("user").id;
  const row = readSkill(userId, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const body = await readJson(c);
  const input = body as Partial<UpdateSkillRequest>;

  const validationError = skillValidationError(input, { partial: true });

  if (validationError !== "") {
    return c.json({ error: validationError }, 400);
  }

  const enabled =
    input.enabled !== undefined ? (input.enabled ? 1 : 0) : (row.enabled ?? 1);

  const next = {
    name: input.name !== undefined ? input.name.trim() : (row.name ?? ""),
    description:
      input.description !== undefined
        ? input.description.trim()
        : (row.description ?? ""),
    instructions:
      input.instructions !== undefined
        ? input.instructions.trim()
        : (row.instructions ?? ""),
    enabled,
    updatedAt: nowIso(),
  };

  db.update(skills)
    .set(next)
    .where(and(eq(skills.id, row.id), eq(skills.userId, userId)))
    .run();

  const updated = readSkill(userId, row.id);

  if (!updated) {
    return c.json({ error: "Skill not found" }, 404);
  }

  if (enabled === 1) {
    const written = writeSkillFiles(userId, updated, { validate: true });

    if (written.error !== "") {
      db.update(skills)
        .set({
          name: row.name ?? "",
          description: row.description ?? "",
          instructions: row.instructions ?? "",
          enabled: row.enabled ?? 1,
          updatedAt: row.updatedAt ?? "",
        })
        .where(and(eq(skills.id, row.id), eq(skills.userId, userId)))
        .run();

      if ((row.enabled ?? 1) === 1) {
        writeSkillFiles(userId, row, { validate: false });
      } else {
        removeSkillFiles(userId, row.slug ?? "");
      }

      return c.json({ error: written.error }, 400);
    }
  } else {
    removeSkillFiles(userId, row.slug ?? "");
  }

  return c.json(toSkillDetail(updated));
});

skillsRoute.delete("/:id", requireAuth, (c) => {
  const userId = c.get("user").id;
  const row = readSkill(userId, c.req.param("id"));

  if (!row) {
    return c.json({ error: "Skill not found" }, 404);
  }

  removeSkillFiles(userId, row.slug ?? "");

  db.delete(skills)
    .where(and(eq(skills.id, row.id), eq(skills.userId, userId)))
    .run();

  return c.json({ deleted: true });
});
