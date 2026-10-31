import { create } from "zustand";
import type { SidebarSection, SidebarSectionsResponse, UpdateSidebarSectionInput } from "@veykor/shared";

export type SidebarSectionsStatus = "idle" | "loading" | "ready" | "error";

interface SidebarSectionsState {
  sections: SidebarSection[];
  status: SidebarSectionsStatus;
  error: string;
  loadSections: () => Promise<void>;
  createSection: (
    title: string,
    kind: "chats" | "projects",
  ) => Promise<boolean>;
  renameSection: (id: string, title: string) => Promise<boolean>;
  deleteSection: (id: string) => Promise<boolean>;
  toggleSection: (section: SidebarSection) => Promise<void>;
}

async function requestSidebar(
  path: string,
  method: string,
  input?: unknown,
): Promise<SidebarSectionsResponse> {
  const response = await fetch("/api/sidebar/" + path, {
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

  return payload as SidebarSectionsResponse;
}

let loadVersion = 0;

export const useSidebarSectionsStore = create<SidebarSectionsState>()(
  (set, get) => ({
    sections: [],
    status: "idle",
    error: "",

    loadSections: async () => {
      if (get().status === "loading") {
        return;
      }

      const version = ++loadVersion;

      set({ status: "loading" });

      try {
        const result = await requestSidebar("sections", "GET");

        if (version === loadVersion) {
          set({ sections: result.sections, status: "ready", error: "" });
        }
      } catch {
        if (version === loadVersion) {
          set({
            status: "error",
            error: "Unable to load your sections. Please retry.",
          });
        }
      }
    },

    createSection: async (title, kind) => {
      const trimmed = title.trim();

      if (!trimmed) {
        return false;
      }

      try {
        const result = await requestSidebar("sections", "POST", {
          title: trimmed,
          kind,
        });

        set({ sections: result.sections, status: "ready", error: "" });
        return true;
      } catch {
        set({ error: "Unable to create the section. Please retry." });
        return false;
      }
    },

    renameSection: async (id, title) => {
      const trimmed = title.trim();

      if (!trimmed) {
        return false;
      }

      const input: UpdateSidebarSectionInput = { title: trimmed };

      try {
        const result = await requestSidebar(`sections/${id}`, "PATCH", input);

        set({ sections: result.sections, status: "ready", error: "" });
        return true;
      } catch {
        set({ error: "Unable to rename the section. Please retry." });
        return false;
      }
    },

    deleteSection: async (id) => {
      try {
        const result = await requestSidebar(`sections/${id}`, "DELETE");

        set({ sections: result.sections, status: "ready", error: "" });
        return true;
      } catch {
        set({ error: "Unable to delete the section. Please retry." });
        return false;
      }
    },

    toggleSection: async (section) => {
      const nextExpanded = !section.isExpanded;

      set({
        sections: get().sections.map((item) =>
          item.id === section.id ? { ...item, isExpanded: nextExpanded } : item,
        ),
      });

      const input: UpdateSidebarSectionInput = { isExpanded: nextExpanded };

      try {
        const result = await requestSidebar(
          `sections/${section.id}`,
          "PATCH",
          input,
        );

        set({ sections: result.sections, status: "ready", error: "" });
      } catch {
        set({ error: "Unable to save the section. Please retry." });
        set({ status: "idle" });
        await get().loadSections();
      }
    },
  }),
);
