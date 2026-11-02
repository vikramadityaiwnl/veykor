import { Hono } from "hono";
import type { CreateSidebarSectionInput, SidebarSectionsResponse, UpdateSidebarSectionInput } from "@veykor/shared";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { chatProviderFor } from "../chat/chat-runner.js";
import { removeStaged } from "../chat/attachments.js";
import { deleteProjectConversations, listProjectConversations } from "../chat/conversations.js";
import { listProjects } from "../db/projects.js";
import { createSidebarSection, deleteSidebarSection, listSidebarSections, updateSidebarSection } from "../db/sidebar-sections.js";

const maxTitleLength = 80;

function validTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const title = value.trim();

  if (title.length === 0 || title.length > maxTitleLength) {
    return null;
  }

  return title;
}

export const sidebarRoute = new Hono<AuthEnv>();

sidebarRoute.use("*", requireAuth);

sidebarRoute.get("/sections", (c) => {
  const response: SidebarSectionsResponse = {
    sections: listSidebarSections(c.get("user").id),
  };

  return c.json(response);
});

sidebarRoute.post("/sections", async (c) => {
  let input: CreateSidebarSectionInput;

  try {
    input = await c.req.json<CreateSidebarSectionInput>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const title = validTitle(input?.title);
  const kind = input?.kind;

  if (title === null || (kind !== "chats" && kind !== "projects")) {
    return c.json(
      {
        error: `Use a section title between 1 and ${maxTitleLength} characters and a chats or projects kind.`,
      },
      400,
    );
  }

  createSidebarSection(c.get("user").id, title, kind);

  const response: SidebarSectionsResponse = {
    sections: listSidebarSections(c.get("user").id),
  };

  return c.json(response, 201);
});

sidebarRoute.patch("/sections/:id", async (c) => {
  let input: UpdateSidebarSectionInput;

  try {
    input = await c.req.json<UpdateSidebarSectionInput>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!input || typeof input !== "object") {
    return c.json({ error: "Invalid section update" }, 400);
  }

  const hasTitle = input.title !== undefined;
  const hasExpanded = input.isExpanded !== undefined;

  if (!hasTitle && !hasExpanded) {
    return c.json({ error: "Nothing to update" }, 400);
  }

  const update: { title?: string; isExpanded?: boolean } = {};

  if (hasTitle) {
    const title = validTitle(input.title);

    if (title === null) {
      return c.json(
        {
          error: `Use a section title between 1 and ${maxTitleLength} characters.`,
        },
        400,
      );
    }

    update.title = title;
  }

  if (hasExpanded) {
    if (typeof input.isExpanded !== "boolean") {
      return c.json({ error: "isExpanded must be a boolean" }, 400);
    }

    update.isExpanded = input.isExpanded;
  }

  const updated = updateSidebarSection(
    c.get("user").id,
    c.req.param("id"),
    update,
  );

  if (updated === null) {
    return c.json({ error: "Section not found" }, 404);
  }

  const response: SidebarSectionsResponse = {
    sections: listSidebarSections(c.get("user").id),
  };

  return c.json(response);
});

sidebarRoute.delete("/sections/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");

  const doomed = listProjects(userId)
    .filter((project) => project.sectionId === id)
    .flatMap((project) => listProjectConversations(userId, project.id));

  if (
    doomed.some((metadata) =>
      chatProviderFor(metadata.providerId)?.isBusy(userId, metadata.id),
    )
  ) {
    return c.json(
      { error: "Stop the section's running chats before deleting it" },
      409,
    );
  }

  const result = deleteSidebarSection(userId, id);

  if (result === "not-found") {
    return c.json({ error: "Section not found" }, 404);
  }

  if (result === "fixed") {
    return c.json({ error: "The Chats section cannot be deleted." }, 403);
  }

  for (const metadata of doomed) {
    await chatProviderFor(metadata.providerId)?.release(userId, metadata.id);
  }

  await Promise.all(
    doomed.flatMap((metadata) =>
      metadata.attachments.map((attachment) => removeStaged(attachment.id)),
    ),
  );

  const doomedProjectIds = new Set(
    doomed.map((metadata) => metadata.projectId ?? ""),
  );

  for (const projectId of doomedProjectIds) {
    if (projectId) {
      deleteProjectConversations(userId, projectId);
    }
  }

  const response: SidebarSectionsResponse = {
    sections: listSidebarSections(userId),
  };

  return c.json(response);
});
