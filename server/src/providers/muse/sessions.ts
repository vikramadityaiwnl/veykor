import type { ProviderSessionsResponse } from "@veykor/shared";
import { resolve } from "node:path";
import { spawnMuse } from "./connection.js";

export async function listMuseSessions(
  workspaceRoot: string,
  cursor = "",
): Promise<ProviderSessionsResponse> {
  const folder = resolve(workspaceRoot);
  const muse = await spawnMuse(folder);

  try {
    const result = await muse.connection.request("session/list", {
      workspaceRoot: folder,
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });

    return {
      sessions: result.sessions
        .filter(
          (session: { workspaceRoot: string }) =>
            session.workspaceRoot === folder,
        )
        .map(
          (session: {
            sessionId: string;
            name?: string;
            title?: string;
            updatedAt?: string;
          }) => ({
            id: session.sessionId,
            title: session.name || session.title || "Untitled session",
            workspaceRoot: folder,
            updatedAt: session.updatedAt || "",
          }),
        ),
      nextCursor: result.nextCursor || "",
    };
  } finally {
    await muse.close();
  }
}
