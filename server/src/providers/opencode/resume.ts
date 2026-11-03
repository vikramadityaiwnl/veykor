import type { OpenCodeConnection } from "./connection.js";

export async function resumeChat(
  connection: OpenCodeConnection,
  sessionId: string,
  folder: string,
) {
  const result = await connection.request(
    "GET",
    `/api/session/${encodeURIComponent(sessionId)}`,
  );

  if (result.data?.location?.directory !== folder) {
    throw new Error("OpenCode session workspace does not match this project");
  }

  return result.data;
}
