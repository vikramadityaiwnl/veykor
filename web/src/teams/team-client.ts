import { teamPaths } from "@veykor/shared";
import type { TeamSnapshot } from "@veykor/shared";

export async function fetchTeam(rootId: string): Promise<TeamSnapshot> {
  const response = await fetch(teamPaths.team(rootId), {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Unable to load this team.");
  }

  return response.json() as Promise<TeamSnapshot>;
}
