import { create } from "zustand";
import type { TranscriptionCatalogResponse, TranscriptionDefaults, TranscriptionKeyStatus, TranscriptionProvider } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

interface TranscriptionDefaultsState extends TranscriptionDefaults {
  providers: TranscriptionProvider[];
  keyConfigured: boolean;
  keyPreview: string;
  status: "idle" | "loading" | "ready" | "error";
  load: () => Promise<void>;
  save: (providerId: string, modelId: string) => Promise<void>;
  saveKey: (key: string) => Promise<void>;
  clearKey: () => Promise<void>;
}

let loadVersion = 0;

export const useTranscriptionDefaultsStore =
  create<TranscriptionDefaultsState>()((set, get) => {
    async function storeKey(key: string, verb: "save" | "remove") {
      const userId = useAuthStore.getState().status?.user?.id;
      const response = await fetch("/api/settings/transcription-key", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
        },
        body: JSON.stringify({ key }),
      });

      if (!response.ok) {
        throw new Error(
          verb === "save"
            ? "Unable to save the API key. Please try again."
            : "Unable to remove the API key. Please try again.",
        );
      }

      const status = (await response.json()) as TranscriptionKeyStatus;

      if (userId !== useAuthStore.getState().status?.user?.id) {
        return;
      }

      set({
        keyConfigured: status.configured,
        keyPreview: status.preview || "",
      });

      const catalogResponse = await fetch(
        "/api/settings/transcription-catalog",
        { credentials: "same-origin" },
      );

      if (!catalogResponse.ok) {
        throw new Error(
          verb === "save"
            ? "Unable to save the API key. Please try again."
            : "Unable to remove the API key. Please try again.",
        );
      }

      const catalog =
        (await catalogResponse.json()) as TranscriptionCatalogResponse;

      if (userId === useAuthStore.getState().status?.user?.id) {
        set({ providers: catalog.providers || [] });
      }
    }

    return {
      providers: [],
      providerId: "",
      modelId: "",
      keyConfigured: false,
      keyPreview: "",
      status: "idle",
      load: async () => {
        if (get().status === "loading" || get().status === "ready") {
          return;
        }

        const version = ++loadVersion;
        const userId = useAuthStore.getState().status?.user?.id;

        set({ status: "loading" });

        try {
          const [catalogResponse, defaultsResponse, keyResponse] =
            await Promise.all([
              fetch("/api/settings/transcription-catalog", {
                credentials: "same-origin",
              }),
              fetch("/api/settings/transcription-defaults", {
                credentials: "same-origin",
              }),
              fetch("/api/settings/transcription-key", {
                credentials: "same-origin",
              }),
            ]);

          if (!catalogResponse.ok || !defaultsResponse.ok || !keyResponse.ok) {
            throw new Error("Unable to load transcription settings");
          }

          const catalog =
            (await catalogResponse.json()) as TranscriptionCatalogResponse;
          const defaults =
            (await defaultsResponse.json()) as TranscriptionDefaults;
          const key = (await keyResponse.json()) as TranscriptionKeyStatus;

          if (
            version === loadVersion &&
            userId === useAuthStore.getState().status?.user?.id
          ) {
            set({
              providers: catalog.providers || [],
              providerId: defaults.providerId || "",
              modelId: defaults.modelId || "",
              keyConfigured: key.configured,
              keyPreview: key.preview || "",
              status: "ready",
            });
          }
        } catch {
          if (version === loadVersion) {
            set({ status: "error" });
          }
        }
      },
      save: async (providerId, modelId) => {
        const previous: TranscriptionDefaults = {
          providerId: get().providerId,
          modelId: get().modelId,
        };
        const next: TranscriptionDefaults = { providerId, modelId };

        if (
          previous.providerId === next.providerId &&
          previous.modelId === next.modelId
        ) {
          return;
        }

        const userId = useAuthStore.getState().status?.user?.id;

        set({ ...next, status: "ready" });

        try {
          const response = await fetch("/api/settings/transcription-defaults", {
            method: "PUT",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-Veykor-Request": "1",
            },
            body: JSON.stringify(next),
          });

          if (!response.ok) {
            throw new Error("Unable to save transcription settings");
          }
        } catch (error) {
          if (userId === useAuthStore.getState().status?.user?.id) {
            set(previous);
          }

          console.error("Unable to save transcription settings", error);
        }
      },
      saveKey: (key) => storeKey(key, "save"),
      clearKey: () => storeKey("", "remove"),
    };
  });

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;
    useTranscriptionDefaultsStore.setState({
      providers: [],
      providerId: "",
      modelId: "",
      keyConfigured: false,
      keyPreview: "",
      status: "idle",
    });
  }
});
