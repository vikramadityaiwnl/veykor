import { homedir } from "node:os";
import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { scanDetectedSkills } from "../skills/detect.js";
import { createSkill, deleteSkill, readSkillDetail, updateSkill, validSkillInput, validSkillName } from "../skills/manage.js";
import { skillDirName } from "../skills/manage.js";

export const integrationsRoute = new Hono<AuthEnv>();

integrationsRoute.use("*", requireAuth);

integrationsRoute.get("/skills", (c) =>
  c.json({
    sources: scanDetectedSkills().map((source) => ({
      id: source.id,
      label: source.label,
      path: source.path,
      skills: source.skills.map((skill) => ({
        id: `${source.id}/${skillDirName(skill.path)}`,
        name: skill.name,
        description: skill.description,
        path: skill.path,
      })),
    })),
  }),
);

function skillIdParam(c: {
  req: { query: (key: string) => string | undefined };
}): string {
  return c.req.query("id") || "";
}

integrationsRoute.get("/skills/file", (c) => {
  const detail = readSkillDetail(homedir(), skillIdParam(c));

  if (!detail) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json(detail);
});

integrationsRoute.post("/skills", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (
    !input ||
    typeof input !== "object" ||
    !validSkillName((input as Record<string, unknown>).name) ||
    !validSkillInput(input)
  ) {
    return c.json({ error: "Enter a valid name, description, and body." }, 400);
  }

  const created = createSkill(homedir(), {
    name: (input as Record<string, string>).name,
    description: (input as Record<string, string>).description,
    body: (input as Record<string, string>).body,
  });

  if (!created) {
    return c.json({ error: "A skill with this name already exists." }, 409);
  }

  return c.json(created, 201);
});

integrationsRoute.put("/skills/file", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (
    !input ||
    typeof input !== "object" ||
    !validSkillName((input as Record<string, unknown>).name) ||
    !validSkillInput(input)
  ) {
    return c.json({ error: "Enter a valid name, description and body." }, 400);
  }

  const updated = updateSkill(homedir(), skillIdParam(c), {
    name: (input as Record<string, string>).name,
    description: (input as Record<string, string>).description,
    body: (input as Record<string, string>).body,
  });

  if (!updated) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json(updated);
});

integrationsRoute.delete("/skills/file", (c) => {
  const deleted = deleteSkill(homedir(), skillIdParam(c));

  if (!deleted) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json({ ok: true });
});
