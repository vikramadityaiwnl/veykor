import { create } from "zustand";
import type { CreateMcpServerInput, McpServer, McpServersResponse, McpTestResult, UpdateMcpServerInput } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

interface McpServersState {
  servers: McpServer[];
  status: "idle" | "loading" | "ready" | "error";
  testingId: string;
  lastTest: McpTestResult | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (input: CreateMcpServerInput) => Promise<McpServer>;
  update: (id: string, input: UpdateMcpServerInput) => Promise<McpServer>;
  remove: (id: string) => Promise<void>;
  testSaved: (id: string) => Promise<McpTestResult>;
  testDraft: (input: CreateMcpServerInput) => Promise<McpTestResult>;
  clearTest: () => void;
}

let loadVersion = 0;

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Veykor-Request": "1",
      ...init?.headers,
    },
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

export const useMcpServersStore = create<McpServersState>()((set, get) => ({
  servers: [],
  status: "idle",
  testingId: "",
  lastTest: null,

  load: async () => {
    if (get().status === "loading" || get().status === "ready") {
      return;
    }

    await get().refresh();
  },

  refresh: async () => {
    const version = ++loadVersion;
    const userId = useAuthStore.getState().status?.user?.id;

    set({ status: "loading" });

    try {
      const payload = (await requestJson("/api/mcp")) as McpServersResponse;

      if (
        version === loadVersion &&
        userId === useAuthStore.getState().status?.user?.id
      ) {
        set({ servers: payload.servers || [], status: "ready" });
      }
    } catch {
      if (version === loadVersion) {
        set({ status: "error" });
      }
    }
  },

  create: async (input) => {
    const server = (await requestJson("/api/mcp", {
      method: "POST",
      body: JSON.stringify(input),
    })) as McpServer;

    set({ servers: [...get().servers, server] });

    return server;
  },

  update: async (id, input) => {
    const server = (await requestJson(`/api/mcp/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    })) as McpServer;

    set({
      servers: get().servers.map((entry) => (entry.id === id ? server : entry)),
    });

    return server;
  },

  remove: async (id) => {
    await requestJson(`/api/mcp/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    set({ servers: get().servers.filter((entry) => entry.id !== id) });
  },

  testSaved: async (id) => {
    set({ testingId: id, lastTest: null });

    try {
      const result = (await requestJson(
        `/api/mcp/${encodeURIComponent(id)}/test`,
        { method: "POST", body: JSON.stringify({}) },
      )) as McpTestResult;

      set({ lastTest: result });

      await get().refresh();

      return result;
    } finally {
      set({ testingId: "" });
    }
  },

  testDraft: async (input) => {
    set({ testingId: "draft", lastTest: null });

    try {
      const result = (await requestJson("/api/mcp/test", {
        method: "POST",
        body: JSON.stringify(input),
      })) as McpTestResult;

      set({ lastTest: result });

      return result;
    } finally {
      set({ testingId: "" });
    }
  },

  clearTest: () => set({ lastTest: null }),
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;

    useMcpServersStore.setState({
      servers: [],
      status: "idle",
      testingId: "",
      lastTest: null,
    });
  }
});
