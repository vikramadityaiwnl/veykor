import { create } from "zustand";
import type { Project, ProjectsResponse } from "@veykor/shared";

export type ProjectsStatus = "idle" | "loading" | "ready" | "error";

interface ProjectsState {
  projects: Project[];
  status: ProjectsStatus;
  error: string;
  loadProjects: () => Promise<void>;
  createProject: (input: {
    name: string;
    folder: string;
    sectionId: string;
  }) => Promise<boolean>;
  renameProject: (id: string, name: string) => Promise<boolean>;
  moveProject: (id: string, sectionId: string) => Promise<boolean>;
}

async function requestProjects(
  path: string,
  method: string,
  input?: unknown,
): Promise<ProjectsResponse> {
  const response = await fetch(`/api/projects${path}`, {
    credentials: "same-origin",
    method,
    headers: {
      "X-Veykor-Request": "1",
      ...(input === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error((payload as { error: string }).error);
  }

  return payload as ProjectsResponse;
}

let loadVersion = 0;

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],
  status: "idle",
  error: "",

  loadProjects: async () => {
    if (get().status === "loading") {
      return;
    }

    const version = ++loadVersion;

    set({ status: "loading" });

    try {
      const result = await requestProjects("", "GET");

      if (version === loadVersion) {
        set({ projects: result.projects, status: "ready", error: "" });
      }
    } catch {
      if (version === loadVersion) {
        set({
          status: "error",
          error: "Unable to load your projects. Please retry.",
        });
      }
    }
  },

  renameProject: async (id, name) => {
    const trimmed = name.trim();

    if (!trimmed) {
      return false;
    }

    try {
      const result = await requestProjects(`/${id}`, "PATCH", {
        name: trimmed,
      });

      set({ projects: result.projects, status: "ready", error: "" });
      return true;
    } catch {
      set({ error: "Unable to rename the project. Please retry." });
      return false;
    }
  },

  moveProject: async (id, sectionId) => {
    try {
      const result = await requestProjects(`/${id}`, "PATCH", { sectionId });

      set({ projects: result.projects, status: "ready", error: "" });
      return true;
    } catch {
      set({ error: "Unable to move the project. Please retry." });
      return false;
    }
  },

  createProject: async (input) => {
    const name = input.name.trim();
    const folder = input.folder.trim();

    if (!name || !folder) {
      return false;
    }

    try {
      const result = await requestProjects("", "POST", {
        name,
        folder,
        sectionId: input.sectionId,
      });

      set({ projects: result.projects, status: "ready", error: "" });
      return true;
    } catch {
      set({ error: "Unable to create the project. Please retry." });
      return false;
    }
  },
}));
