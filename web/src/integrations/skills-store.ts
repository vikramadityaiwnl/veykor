import { create } from "zustand";
import type { CreateSkillInput, DetectedSkillSource, DetectedSkillsResponse, SkillDetail, UpdateSkillInput } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

interface SkillsState {
  sources: DetectedSkillSource[];
  status: "idle" | "loading" | "ready" | "error";
  busyKey: string;
  error: string;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  fetchDetail: (id: string) => Promise<SkillDetail>;
  createSkill: (input: CreateSkillInput) => Promise<SkillDetail>;
  updateSkill: (id: string, input: UpdateSkillInput) => Promise<SkillDetail>;
  removeSkill: (id: string) => Promise<void>;
  clearError: () => void;
}

let loadVersion = 0;

async function requestJson(
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Veykor-Request": "1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "Request failed.";

    throw new Error(message);
  }

  return payload;
}

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  sources: [],
  status: "idle",
  busyKey: "",
  error: "",

  load: async () => {
    if (get().status === "loading" || get().status === "ready") {
      return;
    }

    await get().refresh();
  },

  refresh: async () => {
    const version = ++loadVersion;
    const userId = useAuthStore.getState().status?.user?.id;

    set({ status: "loading", error: "" });

    try {
      const payload = (await requestJson(
        "/api/integrations/skills",
        "GET",
      )) as DetectedSkillsResponse;

      if (
        version === loadVersion &&
        userId === useAuthStore.getState().status?.user?.id
      ) {
        set({ sources: payload.sources || [], status: "ready" });
      }
    } catch {
      if (version === loadVersion) {
        set({ status: "error" });
      }
    }
  },

  fetchDetail: async (id) => {
    set({ busyKey: id, error: "" });

    try {
      return (await requestJson(
        `/api/integrations/skills/file?id=${encodeURIComponent(id)}`,
        "GET",
      )) as SkillDetail;
    } finally {
      set({ busyKey: "" });
    }
  },

  createSkill: async (input) => {
    set({ busyKey: "new", error: "" });

    try {
      const created = (await requestJson(
        "/api/integrations/skills",
        "POST",
        input,
      )) as SkillDetail;

      await get().refresh();

      return created;
    } finally {
      set({ busyKey: "" });
    }
  },

  updateSkill: async (id, input) => {
    set({ busyKey: id, error: "" });

    try {
      const updated = (await requestJson(
        `/api/integrations/skills/file?id=${encodeURIComponent(id)}`,
        "PUT",
        input,
      )) as SkillDetail;

      await get().refresh();

      return updated;
    } finally {
      set({ busyKey: "" });
    }
  },

  removeSkill: async (id) => {
    set({ busyKey: id, error: "" });

    try {
      await requestJson(
        `/api/integrations/skills/file?id=${encodeURIComponent(id)}`,
        "DELETE",
      );
      await get().refresh();
    } catch (requestError) {
      set({
        error:
          requestError instanceof Error
            ? requestError.message
            : "Unable to remove this skill.",
      });

      throw requestError;
    } finally {
      set({ busyKey: "" });
    }
  },

  clearError: () => set({ error: "" }),
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;
    useSkillsStore.setState({
      sources: [],
      status: "idle",
      busyKey: "",
      error: "",
    });
  }
});
