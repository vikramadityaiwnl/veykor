export interface Project {
  id: string;
  name: string;
  folder: string;
  position: number;
  sectionId: string;
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface CreateProjectInput {
  name: string;
  folder: string;
  sectionId: string;
}

export interface UpdateProjectInput {
  name?: string;
  sectionId?: string;
}

export interface ProjectContext {
  branch: string;
  isWorktree: boolean;
}
