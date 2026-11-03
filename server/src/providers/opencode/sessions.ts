import type { ProviderSessionsResponse } from "@veykor/shared";
import { resolve } from "node:path";
import { openCodeConnection } from "./connection.js";

export async function listOpenCodeSessions(
  workspaceRoot: string,
  cursor = "",
): Promise<ProviderSessionsResponse> {
  const folder = resolve(workspaceRoot);
  const connection = await openCodeConnection();
  const query = new URLSearchParams({
    directory: folder,
    parentID: "null",
    limit: "50",
    ...(cursor ? { cursor } : { order: "desc" }),
  });
  const result = await connection.request("GET", `/api/session?${query}`);

  return {
    sessions: result.data
      .filter(
        (session: { location: { directory: string } }) =>
          session.location.directory === folder,
      )
      .map(
        (session: {
          id: string;
          title?: string;
          time: { updated: number };
        }) => ({
          id: session.id,
          title: session.title || "Untitled session",
          workspaceRoot: folder,
          updatedAt: session.time.updated
            ? new Date(session.time.updated).toISOString()
            : "",
        }),
      ),
    nextCursor: result.cursor?.next || "",
  };
}
