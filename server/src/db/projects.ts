import { randomUUID } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import type { Project } from "@veykor/shared";
import { db } from "./client.js";
import { projects } from "./schema.js";

type ProjectRow = typeof projects.$inferSelect;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    folder: row.folder,
    position: row.position,
    sectionId: row.sectionId ?? "",
  };
}

export function listProjects(userId: number): Project[] {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(asc(projects.position), asc(projects.id))
    .all()
    .map(toProject);
}

export function createProject(
  userId: number,
  input: { name: string; folder: string; sectionId: string },
): Project {
  const highest = db
    .select({ value: max(projects.position) })
    .from(projects)
    .where(eq(projects.userId, userId))
    .get();
  const project: Project = {
    id: randomUUID(),
    name: input.name,
    folder: input.folder,
    position: (highest?.value ?? -1) + 1,
    sectionId: input.sectionId,
  };

  db.insert(projects)
    .values({
      id: project.id,
      userId,
      name: project.name,
      folder: project.folder,
      position: project.position,
      sectionId: project.sectionId,
    })
    .run();

  return project;
}

export function updateProject(
  userId: number,
  id: string,
  update: { name?: string; sectionId?: string },
): Project | null {
  const existing = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();

  if (!existing) {
    return null;
  }

  db.update(projects).set(update).where(eq(projects.id, id)).run();

  const updated = db.select().from(projects).where(eq(projects.id, id)).get();

  return updated ? toProject(updated) : null;
}
