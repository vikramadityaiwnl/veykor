import { Hono } from "hono";
import type { CreateProjectInput, ProjectsResponse, UpdateProjectInput } from "@veykor/shared";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { isHostRequest } from "../auth/host-access.js";
import { createProject, listProjects, updateProject } from "../db/projects.js";
import { isProjectSection } from "../db/sidebar-sections.js";

const maxNameLength = 80;
const maxFolderLength = 260;

function validName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.trim();

  if (name.length === 0 || name.length > maxNameLength) {
    return null;
  }

  return name;
}

function validFolder(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const folder = value.trim();

  if (folder.length === 0 || folder.length > maxFolderLength) {
    return null;
  }

  return folder;
}

function validSectionId(userId: number, value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  if (!isProjectSection(userId, value)) {
    return null;
  }

  return value;
}

export const projectsRoute = new Hono<AuthEnv>();

projectsRoute.use("*", requireAuth);

projectsRoute.get("/", (c) => {
  const response: ProjectsResponse = {
    projects: listProjects(c.get("user").id),
  };

  return c.json(response);
});

projectsRoute.post("/", async (c) => {
  if (!isHostRequest(c)) {
    return c.json({ error: "Projects can only be created on the host." }, 403);
  }

  let input: CreateProjectInput;

  try {
    input = await c.req.json<CreateProjectInput>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const name = validName(input?.name);
  const folder = validFolder(input?.folder);
  const sectionId = validSectionId(c.get("user").id, input?.sectionId);

  if (name === null || folder === null || sectionId === null) {
    return c.json(
      {
        error: `Use a project name between 1 and ${maxNameLength} characters, a project folder, and one of your project sections.`,
      },
      400,
    );
  }

  createProject(c.get("user").id, { name, folder, sectionId });

  const created: ProjectsResponse = {
    projects: listProjects(c.get("user").id),
  };

  return c.json(created, 201);
});

projectsRoute.patch("/:id", async (c) => {
  let input: UpdateProjectInput;

  try {
    input = await c.req.json<UpdateProjectInput>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!input || typeof input !== "object") {
    return c.json({ error: "Invalid project update" }, 400);
  }

  const hasName = input.name !== undefined;
  const hasSection = input.sectionId !== undefined;

  if (!hasName && !hasSection) {
    return c.json({ error: "Nothing to update" }, 400);
  }

  const update: { name?: string; sectionId?: string } = {};

  if (hasName) {
    const name = validName(input.name);

    if (name === null) {
      return c.json(
        {
          error: `Use a project name between 1 and ${maxNameLength} characters.`,
        },
        400,
      );
    }

    update.name = name;
  }

  if (hasSection) {
    const sectionId = validSectionId(c.get("user").id, input.sectionId);

    if (sectionId === null) {
      return c.json(
        { error: "Move the project to one of your project sections." },
        400,
      );
    }

    update.sectionId = sectionId;
  }

  const updated = updateProject(c.get("user").id, c.req.param("id"), update);

  if (updated === null) {
    return c.json({ error: "Project not found" }, 404);
  }

  const response: ProjectsResponse = {
    projects: listProjects(c.get("user").id),
  };

  return c.json(response);
});
