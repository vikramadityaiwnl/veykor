import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { isMemoryScope } from "@veykor/shared";
import type {
  CreateMemoryRequest,
  UndoMemoryRequest,
  UpdateMemoryRequest,
} from "@veykor/shared";
import { requireAuth } from "../auth/auth.js";
import type { AuthEnv } from "../auth/auth.js";
import {
  MemoryFailure,
  createMemory,
  deleteMemory,
  listMemories,
  readMemory,
  toMemorySummary,
  undoMemory,
  updateMemory,
} from "./memory-service.js";

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

function failure(c: Context, cause: unknown) {
  if (cause instanceof MemoryFailure) {
    return c.json({ error: cause.message }, cause.status as 400);
  }

  return c.json({ error: "Unable to load learnings." }, 500);
}

export const memoryRoute = new Hono<AuthEnv>();

memoryRoute.use("*", bodyLimit({ maxSize: 128 * 1024 }));

memoryRoute.get("/", requireAuth, (c) => {
  try {
    const scopeParam = c.req.query("scope");
    const projectParam = c.req.query("projectId") ?? "";
    const queryParam = c.req.query("query") ?? "";

    const scope =
      scopeParam !== undefined && isMemoryScope(scopeParam)
        ? scopeParam
        : undefined;

    return c.json(
      listMemories(c.get("user").id, {
        scope,
        projectId: projectParam,
        query: queryParam,
      }),
    );
  } catch (cause) {
    return failure(c, cause);
  }
});

memoryRoute.post("/", requireAuth, async (c) => {
  try {
    const body = (await readJson(c)) as Partial<CreateMemoryRequest>;

    const created = createMemory(c.get("user").id, {
      instruction: typeof body.instruction === "string" ? body.instruction : "",
      scope: isMemoryScope(body.scope) ? body.scope : "global",
      projectId: typeof body.projectId === "string" ? body.projectId : "",
    });

    return c.json(created, 201);
  } catch (cause) {
    return failure(c, cause);
  }
});

memoryRoute.get("/:id", requireAuth, (c) => {
  try {
    const row = readMemory(c.get("user").id, c.req.param("id"));

    if (!row) {
      return c.json({ error: "Learning not found." }, 404);
    }

    return c.json(toMemorySummary(row));
  } catch (cause) {
    return failure(c, cause);
  }
});

memoryRoute.put("/:id", requireAuth, async (c) => {
  try {
    const body = (await readJson(c)) as Partial<UpdateMemoryRequest>;

    const input: Partial<UpdateMemoryRequest> = {};

    if (body.instruction !== undefined) {
      input.instruction =
        typeof body.instruction === "string" ? body.instruction : "";
    }

    if (body.scope !== undefined) {
      if (!isMemoryScope(body.scope)) {
        return c.json({ error: "Choose a global or project scope." }, 400);
      }

      input.scope = body.scope;
    }

    if (body.projectId !== undefined) {
      input.projectId =
        typeof body.projectId === "string" ? body.projectId : "";
    }

    if (body.expectedUpdatedAt !== undefined) {
      input.expectedUpdatedAt =
        typeof body.expectedUpdatedAt === "string"
          ? body.expectedUpdatedAt
          : "";
    }

    const { summary } = updateMemory(
      c.get("user").id,
      c.req.param("id"),
      input,
    );

    return c.json(summary);
  } catch (cause) {
    return failure(c, cause);
  }
});

memoryRoute.delete("/:id", requireAuth, async (c) => {
  try {
    const body = await readJson(c);
    const expected =
      typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt
        : undefined;

    deleteMemory(c.get("user").id, c.req.param("id"), expected);

    return c.json({ deleted: true });
  } catch (cause) {
    return failure(c, cause);
  }
});

memoryRoute.post("/:id/undo", requireAuth, async (c) => {
  try {
    const body = (await readJson(c)) as Partial<UndoMemoryRequest>;

    const result = undoMemory(c.get("user").id, c.req.param("id"), {
      expectedUpdatedAt:
        typeof body.expectedUpdatedAt === "string"
          ? body.expectedUpdatedAt
          : undefined,
      previousInstruction:
        typeof body.previousInstruction === "string"
          ? body.previousInstruction
          : undefined,
      previousScope: isMemoryScope(body.previousScope)
        ? body.previousScope
        : undefined,
      previousProjectId:
        typeof body.previousProjectId === "string"
          ? body.previousProjectId
          : undefined,
    });

    if ("deleted" in result) {
      return c.json({ deleted: true });
    }

    return c.json(result.summary);
  } catch (cause) {
    return failure(c, cause);
  }
});
