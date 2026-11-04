import { beginTeamDeletion, teamHasWork } from "../teams/team-runtime.js";
import { pickNativeFolder } from "./native-folder-picker.js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync, statSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, isAbsolute } from "node:path";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { defaultProjectSectionId } from "@veykor/shared";
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type {
  AgentDefinition,
  AgentInput,
  ProjectInput,
  WorkProject,
} from "@veykor/shared";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import { isHostRequest } from "../auth/host-access.js";
import { db } from "../db/client.js";
import { agents, projects, chats } from "../db/schema.js";
import { isMuseTurnRunning, leaveMuseSession } from "../muse/chat-service.js";

export function readAgent(
  userId: number,
  id: string,
): AgentDefinition | undefined {
  const row = db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))
    .get();

  return row
    ? ({ ...JSON.parse(row.data), id: row.id } as AgentDefinition)
    : undefined;
}

export function readProject(userId: number, id: string) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();
}

export function projectBranch(folder: string): string {
  try {
    return (
      execFileSync("git", ["-C", folder, "branch", "--show-current"], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || "Detached HEAD"
    );
  } catch {
    return "No branch";
  }
}

export function normalizeAgent(input: Partial<AgentInput>): AgentInput {
  const clean = (value: unknown, limit: number) =>
    typeof value === "string" ? value.trim().slice(0, limit) : "";

  return {
    name: clean(input.name, 100),
    description: clean(input.description, 500),
    avatar: clean(input.avatar, 16),
    instructions: clean(input.instructions, 20000),
    modelId: clean(input.modelId, 200),
    providerId: clean(input.providerId, 200),
    reasoningEffort: clean(input.reasoningEffort, 100),
    permission:
      input.permission === "full-access" || input.permission === "approved"
        ? input.permission
        : "read-only",
  };
}

const validateInput: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (c.req.method === "POST" || c.req.method === "PUT") {
    try {
      const body: unknown = await c.req.json();

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return c.json({ error: "Enter a valid configuration." }, 400);
      }
    } catch {
      return c.json({ error: "Enter a valid configuration." }, 400);
    }
  }

  await next();
};

export const agentRoute = new Hono<AuthEnv>();
agentRoute.use(
  "*",
  requireAuth,
  bodyLimit({ maxSize: 128 * 1024 }),
  validateInput,
);

agentRoute.get("/", (c) =>
  c.json(
    db
      .select()
      .from(agents)
      .where(eq(agents.userId, c.get("user").id))
      .all()
      .map((row) => ({ ...JSON.parse(row.data), id: row.id })),
  ),
);

agentRoute.post("/", async (c) => {
  const data = normalizeAgent(await c.req.json());

  if (!data.name) {
    return c.json({ error: "Give the agent a name." }, 400);
  }

  const id = randomUUID();
  db.insert(agents)
    .values({ id, userId: c.get("user").id, data: JSON.stringify(data) })
    .run();

  return c.json({ ...data, id }, 201);
});

agentRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").id;

  if (!readAgent(userId, id)) {
    return c.json({ error: "Agent not found." }, 404);
  }

  const data = normalizeAgent(await c.req.json());

  if (!data.name) {
    return c.json({ error: "Give the agent a name." }, 400);
  }

  db.update(agents)
    .set({ data: JSON.stringify(data) })
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))
    .run();

  return c.json({ ...data, id });
});

agentRoute.delete("/:id", (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");

  if (!readAgent(userId, id)) {
    return c.json({ error: "Agent not found." }, 404);
  }

  db.transaction((tx) => {
    tx.delete(agents)
      .where(and(eq(agents.id, id), eq(agents.userId, userId)))
      .run();

    for (const project of tx
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .all()) {
      tx.update(projects)
        .set({
          agentIds: JSON.stringify(
            (JSON.parse(project.agentIds) as string[]).filter(
              (agentId) => agentId !== id,
            ),
          ),
        })
        .where(eq(projects.id, project.id))
        .run();
    }
  });

  return c.json({ deleted: true });
});

export const projectRoute = new Hono<AuthEnv>();
projectRoute.use(
  "*",
  requireAuth,
  bodyLimit({ maxSize: 128 * 1024 }),
  validateInput,
);

projectRoute.post("/pick-folder", async (c) => {
  if (!isHostRequest(c)) {
    return c.json(
      { error: "Folders can only be selected on the host computer." },
      403,
    );
  }

  if (process.platform !== "darwin") {
    return c.json(
      { error: "Native folder selection is unavailable on this host." },
      501,
    );
  }

  try {
    return c.json(await pickNativeFolder());
  } catch (cause) {
    return c.json(
      {
        error:
          cause instanceof Error ? cause.message : "Unable to select a folder.",
      },
      502,
    );
  }
});

projectRoute.get("/folders", (c) => {
  if (!isHostRequest(c)) {
    return c.json(
      { error: "Folders can only be selected on the host computer." },
      403,
    );
  }

  try {
    const folder = realpathSync(c.req.query("path") || homedir());

    if (!statSync(folder).isDirectory()) {
      return c.json({ error: "Choose a directory." }, 400);
    }

    const folders = readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => ({ name: entry.name, path: join(folder, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return c.json({
      path: folder,
      name: basename(folder),
      parent: dirname(folder),
      folders,
    });
  } catch {
    return c.json(
      { error: "Unable to open that folder. Check the path and permissions." },
      400,
    );
  }
});

projectRoute.get("/", (c) => {
  const result: WorkProject[] = db
    .select()
    .from(projects)
    .where(eq(projects.userId, c.get("user").id))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      folder: row.folder,
      sectionId: row.sectionId,
      agentIds: JSON.parse(row.agentIds),
      branch: projectBranch(row.folder),
    }));

  return c.json(result);
});

for (const method of ["post", "put"] as const) {
  projectRoute[method](method === "post" ? "/" : "/:id", async (c) => {
    if (method === "post" && !isHostRequest(c)) {
      return c.json(
        { error: "Projects can only be added on the host computer." },
        403,
      );
    }

    const userId = c.get("user").id;
    const existing =
      method === "put"
        ? readProject(userId, c.req.param("id") ?? "")
        : undefined;

    if (method === "put" && !existing) {
      return c.json({ error: "Project not found." }, 404);
    }

    const body = await c.req.json<Partial<ProjectInput>>();
    let name =
      typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    let folder =
      existing?.folder ??
      (typeof body.folder === "string" ? body.folder.trim() : "");

    try {
      if (!isAbsolute(folder) || !statSync(folder).isDirectory()) {
        throw new Error();
      }

      folder = realpathSync(folder);
      name = name || basename(folder) || folder;
    } catch {
      return c.json(
        {
          error: "Enter an existing absolute folder path on the host.",
        },
        400,
      );
    }

    const agentIds = Array.isArray(body.agentIds)
      ? [...new Set(body.agentIds)]
      : [];

    if (
      agentIds.some((id) => typeof id !== "string" || !readAgent(userId, id))
    ) {
      return c.json({ error: "Choose agents from your library." }, 400);
    }

    const id = existing?.id ?? randomUUID();
    const sectionId =
      typeof body.sectionId === "string"
        ? body.sectionId.slice(0, 128)
        : defaultProjectSectionId;
    const values = {
      name,
      folder,
      sectionId,
      agentIds: JSON.stringify(agentIds),
    };

    if (existing) {
      db.update(projects)
        .set(values)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .run();
    } else {
      db.insert(projects)
        .values({ id, userId, ...values })
        .run();
    }

    return c.json(
      { id, name, folder, sectionId, agentIds, branch: projectBranch(folder) },
      method === "post" ? 201 : 200,
    );
  });
}

projectRoute.delete("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");

  if (!readProject(userId, id)) {
    return c.json({ error: "Project not found." }, 404);
  }

  const doomed = db
    .select()
    .from(chats)
    .where(and(eq(chats.projectId, id), eq(chats.userId, userId)))
    .all();

  if (
    doomed.some(
      (chat) =>
        isMuseTurnRunning(chat.museSessionId) ||
        (!chat.parentChatId && teamHasWork(chat)),
    )
  ) {
    return c.json(
      { error: "Stop all running chats before deleting this project." },
      409,
    );
  }

  const releases: (() => void)[] = [];

  try {
    for (const root of doomed.filter((chat) => !chat.parentChatId)) {
      releases.push(beginTeamDeletion(root));
    }
  } catch (cause) {
    releases.forEach((release) => release());
    return c.json(
      { error: cause instanceof Error ? cause.message : "This team is busy." },
      409,
    );
  }

  try {
    await Promise.all(
      doomed.map((chat) => leaveMuseSession(chat.museSessionId)),
    );
    db.transaction((tx) => {
      tx.delete(chats)
        .where(and(eq(chats.projectId, id), eq(chats.userId, userId)))
        .run();
      tx.delete(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .run();
    });
  } catch {
    return c.json(
      { error: "Unable to stop project sessions. Try again." },
      502,
    );
  } finally {
    releases.forEach((release) => release());
  }

  return c.json({ deleted: true });
});
