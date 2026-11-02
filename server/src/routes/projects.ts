import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { ProjectContext } from "@veykor/shared";
import { Hono } from "hono";
import type { CreateProjectInput, ProjectsResponse, UpdateProjectInput } from "@veykor/shared";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { isHostRequest } from "../auth/host-access.js";
import { chatProvider } from "../chat/chat-runner.js";
import { removeStaged } from "../chat/attachments.js";
import { deleteProjectConversations, listProjectConversations } from "../chat/conversations.js";
import { createProject, deleteProject, listProjects, updateProject } from "../db/projects.js";
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

projectsRoute.delete("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");

  const project = listProjects(userId).find((entry) => entry.id === id);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const doomed = listProjectConversations(userId, id);

  if (doomed.some((metadata) => chatProvider.isBusy(userId, metadata.id))) {
    return c.json(
      { error: "Stop the project's running chats before deleting it" },
      409,
    );
  }

  for (const metadata of doomed) {
    await chatProvider.release(userId, metadata.id);
  }

  await Promise.all(
    doomed.flatMap((metadata) =>
      metadata.attachments.map((attachment) => removeStaged(attachment.id)),
    ),
  );

  deleteProjectConversations(userId, id);
  deleteProject(userId, id);

  const response: ProjectsResponse = {
    projects: listProjects(userId),
  };

  return c.json(response);
});

projectsRoute.get("/:id/context", async (c) => {
  const project = listProjects(c.get("user").id).find(
    (entry) => entry.id === c.req.param("id"),
  );

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const context: ProjectContext = { branch: "", isWorktree: false };
  const git = async (args: string[]) =>
    (
      await promisify(execFile)("git", args, {
        cwd: project.folder,
        timeout: 3000,
        maxBuffer: 4096,
      })
    ).stdout.trim();

  try {
    const [branch, gitDir, commonDir] = await Promise.all([
      git(["branch", "--show-current"]),
      git(["rev-parse", "--git-dir"]),
      git(["rev-parse", "--git-common-dir"]),
    ]);
    context.branch = branch || (await git(["rev-parse", "--short", "HEAD"]));
    context.isWorktree =
      resolve(project.folder, gitDir) !== resolve(project.folder, commonDir);
  } catch {
    return c.json(context);
  }

  return c.json(context);
});
