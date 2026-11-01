import { create } from "zustand";
import type { McpDetectedResponse, McpDetectedSource, McpServer } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";
import { useMcpServersStore } from "./mcp-servers-store";

interface McpDetectedState {
  sources: McpDetectedSource[];
  status: "idle" | "loading" | "ready" | "error";
  busyKey: string;
  error: string;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  importServer: (sourceId: string, serverKey: string) => Promise<boolean>;
  importSource: (
    sourceId: string,
  ) => Promise<{ imported: number; failed: number }>;
  removeServer: (sourceId: string, serverKey: string) => Promise<boolean>;
  clearError: () => void;
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

  importServer: async (sourceId, serverKey) => {
    set({ busyKey: detectedActionKey(sourceId, serverKey), error: "" });

    try {
      const server = (await requestJson("/api/mcp/detected/import", {
        sourceId,
        serverKey,
      })) as McpServer;

      useMcpServersStore.setState((state) => ({
        servers: [...state.servers, server],
      }));

      await get().refresh();

      return true;
    } catch (requestError) {
      set({
        error:
          requestError instanceof Error
            ? requestError.message
            : "Unable to import this server.",
      });

      return false;
    } finally {
      set({ busyKey: "" });
    }
  },

  importSource: async (sourceId) => {
    const source = get().sources.find((entry) => entry.id === sourceId);
    const pending = (source?.servers || []).filter(
      (server) => !server.imported,
    );

    let imported = 0;
    let failed = 0;

    set({ busyKey: detectedActionKey(sourceId, "*"), error: "" });

    try {
      for (const server of pending) {
        try {
          const created = (await requestJson("/api/mcp/detected/import", {
            sourceId,
            serverKey: server.key,
          })) as McpServer;

          useMcpServersStore.setState((state) => ({
            servers: [...state.servers, created],
          }));

          imported += 1;
        } catch {
          failed += 1;
        }
      }

      if (failed > 0) {
        set({
          error:
            failed === 1
              ? "One server could not be imported."
              : `${failed} servers could not be imported.`,
        });
      }

      await get().refresh();

      return { imported, failed };
    } finally {
      set({ busyKey: "" });
    }
  },

  removeServer: async (sourceId, serverKey) => {
    set({ busyKey: detectedActionKey(sourceId, serverKey), error: "" });

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
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;

    useMcpDetectedStore.setState({
      sources: [],
      status: "idle",
      busyKey: "",
      error: "",
    });
  }
});
