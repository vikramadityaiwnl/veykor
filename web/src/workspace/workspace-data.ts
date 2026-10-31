export interface WorkspaceProject {
  id: string;
  name: string;
}

export interface TeamAgent {
  id: string;
  name: string;
}

export const workspaceProjects: WorkspaceProject[] = [
  { id: "atlas-app", name: "Atlas app" },
  { id: "docs-site", name: "docs-site" },
  { id: "veykor", name: "veykor" },
];

export const defaultProjectId = "atlas-app";

export const teamAgents: TeamAgent[] = [
  { id: "lead", name: "Lead" },
  { id: "builder", name: "Builder" },
  { id: "reviewer", name: "Reviewer" },
  { id: "qa", name: "QA" },
];
