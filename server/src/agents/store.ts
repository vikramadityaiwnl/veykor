import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Agent, CreateAgentInput } from "@veykor/shared";
import { db } from "../db/client.js";
import { agents } from "../db/schema.js";

type Row = typeof agents.$inferSelect;

function parseList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function toIso(value: number): string {
  return value > 0 ? new Date(value).toISOString() : "";
}

export function toAgent(row: Row): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    providerId: row.providerId === "opencode" ? "opencode" : "muse",
    modelId: row.modelId,
    reasoningEffort: (row.reasoningEffort || "") as Agent["reasoningEffort"],
    permissionMode: row.permissionMode as Agent["permissionMode"],
    projectIds: parseList(row.projectIds),
    toolsMode: row.toolsMode === "restricted" ? "restricted" : "unrestricted",
    allowedTools: parseList(row.allowedTools),
    skillsMode: row.skillsMode === "restricted" ? "restricted" : "unrestricted",
    skillIds: parseList(row.skillIds),
    mcpMode: row.mcpMode === "restricted" ? "restricted" : "unrestricted",
    mcpServerIds: parseList(row.mcpServerIds),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function listAgents(userId: number): Agent[] {
  return db
    .select()
    .from(agents)
    .where(eq(agents.userId, userId))
    .orderBy(asc(agents.createdAt), asc(agents.id))
    .all()
    .map(toAgent);
}

export function readAgent(userId: number, id: string): Agent | null {
  const row = db
    .select()
    .from(agents)
    .where(and(eq(agents.userId, userId), eq(agents.id, id)))
    .get();

  return row ? toAgent(row) : null;
}

export function listAgentsForProject(
  userId: number,
  projectId: string,
): Agent[] {
  return listAgents(userId).filter((agent) =>
    agent.projectIds.includes(projectId),
  );
}

export function createAgent(userId: number, input: CreateAgentInput): Agent {
  const now = Date.now();
  const id = randomUUID();

  db.insert(agents)
    .values({
      id,
      userId,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      providerId: input.providerId,
      modelId: input.modelId,
      reasoningEffort: input.reasoningEffort,
      permissionMode: input.permissionMode,
      projectIds: JSON.stringify(input.projectIds),
      toolsMode: input.toolsMode,
      allowedTools: JSON.stringify(input.allowedTools),
      skillsMode: input.skillsMode,
      skillIds: JSON.stringify(input.skillIds),
      mcpMode: input.mcpMode,
      mcpServerIds: JSON.stringify(input.mcpServerIds),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return readAgent(userId, id)!;
}

export function updateAgent(
  userId: number,
  id: string,
  input: CreateAgentInput,
): Agent | null {
  const existing = readAgent(userId, id);

  if (!existing) {
    return null;
  }

  db.update(agents)
    .set({
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      providerId: input.providerId,
      modelId: input.modelId,
      reasoningEffort: input.reasoningEffort,
      permissionMode: input.permissionMode,
      projectIds: JSON.stringify(input.projectIds),
      toolsMode: input.toolsMode,
      allowedTools: JSON.stringify(input.allowedTools),
      skillsMode: input.skillsMode,
      skillIds: JSON.stringify(input.skillIds),
      mcpMode: input.mcpMode,
      mcpServerIds: JSON.stringify(input.mcpServerIds),
      updatedAt: Date.now(),
    })
    .where(and(eq(agents.userId, userId), eq(agents.id, id)))
    .run();

  return readAgent(userId, id);
}

export function deleteAgent(userId: number, id: string): boolean {
  const existing = readAgent(userId, id);

  if (!existing) {
    return false;
  }

  db.delete(agents)
    .where(and(eq(agents.userId, userId), eq(agents.id, id)))
    .run();

  return true;
}
