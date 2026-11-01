import { create } from "zustand";
import type { McpDetectedResponse, McpDetectedSource, McpTestResult } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

interface McpDetectedState {
  sources: McpDetectedSource[];
  status: "idle" | "loading" | "ready" | "error";
  busyKey: string;
  error: string;
  lastTest: McpTestResult | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  testServer: (sourceId: string, serverKey: string) => Promise<void>;
  removeServer: (sourceId: string, serverKey: string) => Promise<boolean>;
  clearError: () => void;
  clearTest: () => void;
}

let loadVersion = 0;

async function requestJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Veykor-Request": "1",
    },
    body: JSON.stringify(body),
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

export function detectedActionKey(sourceId: string, serverKey: string): string {
  return `${sourceId}::${serverKey}`;
}

export const useMcpDetectedStore = create<McpDetectedState>()((set, get) => ({
  sources: [],
  status: "idle",
  busyKey: "",
  error: "",
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

    set({ status: "loading", error: "" });

    try {
      const response = await fetch("/api/mcp/detected", {
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Unable to load detected servers");
      }

      const payload = (await response.json()) as McpDetectedResponse;

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

  testServer: async (sourceId, serverKey) => {
    set({
      busyKey: detectedActionKey(sourceId, serverKey),
      error: "",
      lastTest: null,
    });

    try {
      const result = (await requestJson("/api/mcp/detected/test", {
        sourceId,
        serverKey,
      })) as McpTestResult;

      set({ lastTest: result });
    } catch (requestError) {
      set({
        error:
          requestError instanceof Error
            ? requestError.message
            : "Unable to test this server.",
      });
    } finally {
      set({ busyKey: "" });
    }
  },

  removeServer: async (sourceId, serverKey) => {
    set({
      busyKey: detectedActionKey(sourceId, serverKey),
      error: "",
      lastTest: null,
    });

    try {
      await requestJson("/api/mcp/detected/remove", { sourceId, serverKey });
      await get().refresh();

      return true;
    } catch (requestError) {
      set({
        error:
          requestError instanceof Error
            ? requestError.message
            : "Unable to remove this server.",
      });

      return false;
    } finally {
      set({ busyKey: "" });
    }
  },

  clearError: () => set({ error: "" }),

  clearTest: () => set({ lastTest: null }),
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;

    useMcpDetectedStore.setState({
      sources: [],
      status: "idle",
      busyKey: "",
      error: "",
      lastTest: null,
    });
  }
});
