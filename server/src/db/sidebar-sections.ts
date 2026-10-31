import { randomUUID } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import type { SidebarSection, SidebarSectionKind } from "@veykor/shared";
import { db } from "./client.js";
import { projects, sidebarSections } from "./schema.js";

type SidebarSectionRow = typeof sidebarSections.$inferSelect;

function toSidebarSection(row: SidebarSectionRow): SidebarSection {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as SidebarSectionKind,
    position: row.position,
    isExpanded: row.isExpanded !== 0,
    isFixed: row.isFixed !== 0,
  };
}

export function listSidebarSections(userId: number): SidebarSection[] {
  return db
    .select()
    .from(sidebarSections)
    .where(eq(sidebarSections.userId, userId))
    .orderBy(asc(sidebarSections.position), asc(sidebarSections.id))
    .all()
    .map(toSidebarSection);
}

export function insertDefaultSidebarSections(userId: number): void {
  db.insert(sidebarSections)
    .values([
      {
        id: `chats-${userId}`,
        userId,
        title: "Chats",
        kind: "chats",
        position: 0,
        isExpanded: 0,
        isFixed: 1,
      },
      {
        id: `projects-${userId}`,
        userId,
        title: "Projects",
        kind: "projects",
        position: 1,
        isExpanded: 1,
        isFixed: 0,
      },
    ])
    .onConflictDoNothing()
    .run();
}

export function createSidebarSection(
  userId: number,
  title: string,
  kind: "chats" | "projects",
): SidebarSection {
  const highest = db
    .select({ value: max(sidebarSections.position) })
    .from(sidebarSections)
    .where(eq(sidebarSections.userId, userId))
    .get();
  const section: SidebarSection = {
    id: randomUUID(),
    title,
    kind,
    position: (highest?.value ?? -1) + 1,
    isExpanded: true,
    isFixed: false,
  };

  db.insert(sidebarSections)
    .values({
      id: section.id,
      userId,
      title: section.title,
      kind: section.kind,
      position: section.position,
      isExpanded: 1,
      isFixed: 0,
    })
    .run();

  return section;
}

export function updateSidebarSection(
  userId: number,
  id: string,
  update: { title?: string; isExpanded?: boolean },
): SidebarSection | null {
  const existing = db
    .select()
    .from(sidebarSections)
    .where(and(eq(sidebarSections.id, id), eq(sidebarSections.userId, userId)))
    .get();

  if (!existing) {
    return null;
  }

  const changes: Partial<SidebarSectionRow> = {};

  if (update.title !== undefined) {
    changes.title = update.title;
  }

  if (update.isExpanded !== undefined) {
    changes.isExpanded = update.isExpanded ? 1 : 0;
  }

  if (Object.keys(changes).length > 0) {
    db.update(sidebarSections)
      .set(changes)
      .where(eq(sidebarSections.id, id))
      .run();
  }

  const updated = db
    .select()
    .from(sidebarSections)
    .where(eq(sidebarSections.id, id))
    .get();

  return updated ? toSidebarSection(updated) : null;
}

export function isProjectSection(userId: number, sectionId: string): boolean {
  const section = db
    .select({ kind: sidebarSections.kind })
    .from(sidebarSections)
    .where(
      and(
        eq(sidebarSections.id, sectionId),
        eq(sidebarSections.userId, userId),
      ),
    )
    .get();

  return section !== undefined && section.kind !== "chats";
}

export type DeleteSidebarSectionResult = "deleted" | "not-found" | "fixed";

export function deleteSidebarSection(
  userId: number,
  id: string,
): DeleteSidebarSectionResult {
  const existing = db
    .select()
    .from(sidebarSections)
    .where(and(eq(sidebarSections.id, id), eq(sidebarSections.userId, userId)))
    .get();

  if (!existing) {
    return "not-found";
  }

  if (existing.isFixed !== 0) {
    return "fixed";
  }

  db.delete(projects)
    .where(and(eq(projects.sectionId, id), eq(projects.userId, userId)))
    .run();
  db.delete(sidebarSections).where(eq(sidebarSections.id, id)).run();

  return "deleted";
}
