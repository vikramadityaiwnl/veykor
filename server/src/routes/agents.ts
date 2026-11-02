import { Hono } from "hono";
import type { AgentsResponse, ProjectAgentsResponse } from "@veykor/shared";
import { requireAuth, type AuthEnv } from "../auth/auth.js";
import { createAgent, deleteAgent, listAgents, listAgentsForProject, readAgent, updateAgent } from "../agents/store.js";
import { agentInputError, normalizeAgentInput, validAgentInput } from "../agents/validation.js";
import { listProjects } from "../db/projects.js";
import { listMcpServers } from "../mcp/store.js";
import { scanDetectedSkills } from "../skills/detect.js";
import { skillDirName } from "../skills/manage.js";

export const agentsRoute = new Hono<AuthEnv>();

agentsRoute.use("*", requireAuth);

agentsRoute.get("/", (c) => {
  const projectId = c.req.query("projectId");
  const userId = c.get("user").id;

  if (projectId) {
    const project = listProjects(userId).find(
      (entry) => entry.id === projectId,
    );

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const response: ProjectAgentsResponse = {
      agents: listAgentsForProject(userId, projectId).map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        providerId: agent.providerId,
        modelId: agent.modelId,
        reasoningEffort: agent.reasoningEffort,
        permissionMode: agent.permissionMode,
      })),
    };

    return c.json(response);
  }

  const response: AgentsResponse = { agents: listAgents(userId) };

  return c.json(response);
});

function referencesError(
  userId: number,
  input: ReturnType<typeof normalizeAgentInput>,
): string {
  const projectIds = new Set(listProjects(userId).map((project) => project.id));

  if (input.projectIds.some((id) => !projectIds.has(id))) {
    return "Choose projects from your own project list.";
  }

  if (input.skillsMode === "restricted") {
    const known = new Set(
      scanDetectedSkills().flatMap((source) =>
        source.skills.map(
          (skill) => `${source.id}/${skillDirName(skill.path)}`,
        ),
      ),
    );

    if (input.skillIds.some((id) => !known.has(id))) {
      return "Choose skills from the detected skills list.";
    }
  }

  if (input.mcpMode === "restricted") {
    const known = new Set(listMcpServers(userId).map((server) => server.id));

    if (input.mcpServerIds.some((id) => !known.has(id))) {
      return "Choose MCP servers from your own integrations.";
    }
  }

  return "";
}

agentsRoute.post("/", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validAgentInput(input)) {
    return c.json({ error: "Enter a valid agent." }, 400);
  }

  const normalized = normalizeAgentInput(input);
  const capabilityError = agentInputError(normalized);

  if (capabilityError) {
    return c.json({ error: capabilityError }, 400);
  }

  const referenceError = referencesError(c.get("user").id, normalized);

  if (referenceError) {
    return c.json({ error: referenceError }, 400);
  }

  if (listAgents(c.get("user").id).length >= 100) {
    return c.json({ error: "You can create up to 100 agents." }, 400);
  }

  return c.json(createAgent(c.get("user").id, normalized), 201);
});

agentsRoute.put("/:id", async (c) => {
  const input: unknown = await c.req.json().catch(() => null);

  if (!validAgentInput(input)) {
    return c.json({ error: "Enter a valid agent." }, 400);
  }

  if (!readAgent(c.get("user").id, c.req.param("id"))) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const normalized = normalizeAgentInput(input);
  const capabilityError = agentInputError(normalized);

  if (capabilityError) {
    return c.json({ error: capabilityError }, 400);
  }

  const referenceError = referencesError(c.get("user").id, normalized);

  if (referenceError) {
    return c.json({ error: referenceError }, 400);
  }

  const updated = updateAgent(c.get("user").id, c.req.param("id"), normalized);

  if (!updated) {
    return c.json({ error: "Agent not found" }, 404);
  }

  return c.json(updated);
});

agentsRoute.delete("/:id", (c) => {
  const deleted = deleteAgent(c.get("user").id, c.req.param("id"));

  if (!deleted) {
    return c.json({ error: "Agent not found" }, 404);
  }

  return c.json({ ok: true });
});

agentsRoute.get("/:id", (c) => {
  const agent = readAgent(c.get("user").id, c.req.param("id"));

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  return c.json(agent);
});
