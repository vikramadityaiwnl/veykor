import { create } from "zustand";
import type { ChatDefaults, ChatMessageBehavior, ChatPermissionMode, ChatReasoningEffort } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";

interface ChatDefaultsState extends ChatDefaults {
  status: "idle" | "loading" | "ready" | "error";
  load: () => Promise<void>;
  save: (providerId: string, modelId: string) => Promise<void>;
  saveEffort: (modelId: string, effort: ChatReasoningEffort) => Promise<void>;
  saveBehavior: (behavior: ChatMessageBehavior) => Promise<void>;
  savePermission: (mode: ChatPermissionMode) => Promise<void>;
}

let loadVersion = 0;

export const useChatDefaultsStore = create<ChatDefaultsState>()((set, get) => ({
  messageBehavior: "queue",
  defaultProviderId: "",
  models: {},
  efforts: {},
  permissionMode: "promptUnmatched",
  status: "idle",
  load: async () => {
    if (get().status === "loading" || get().status === "ready") {
      return;
    }

    const version = ++loadVersion;
    const userId = useAuthStore.getState().status?.user?.id;

    set({ status: "loading" });

    try {
      const response = await fetch("/api/settings/chat-defaults", {
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Unable to load chat defaults");
      }

      const defaults = (await response.json()) as ChatDefaults;

      if (
        version === loadVersion &&
        userId === useAuthStore.getState().status?.user?.id
      ) {
        set({
          messageBehavior: defaults.messageBehavior,
          defaultProviderId: defaults.defaultProviderId || "",
          models: defaults.models || {},
          efforts: defaults.efforts || {},
          permissionMode: defaults.permissionMode || "promptUnmatched",
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
    const previous: ChatDefaults = {
      messageBehavior: get().messageBehavior,
      defaultProviderId: get().defaultProviderId,
      models: get().models,
      efforts: get().efforts,
      permissionMode: get().permissionMode,
    };
    const next: ChatDefaults = {
      ...previous,
      defaultProviderId: providerId,
      models: { ...previous.models, [providerId]: modelId },
    };

    if (
      previous.defaultProviderId === next.defaultProviderId &&
      previous.models[providerId] === modelId
    ) {
      return;
    }

    const userId = useAuthStore.getState().status?.user?.id;

    set({ ...next, status: "ready" });

    try {
      const response = await fetch("/api/settings/chat-defaults", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
        },
        body: JSON.stringify(next),
      });

      if (!response.ok) {
        throw new Error("Unable to save chat defaults");
      }
    } catch (error) {
      if (userId === useAuthStore.getState().status?.user?.id) {
        set(previous);
      }

      console.error("Unable to save chat defaults", error);
    }
  },
  saveEffort: async (modelId, effort) => {
    const previous: ChatDefaults = {
      messageBehavior: get().messageBehavior,
      defaultProviderId: get().defaultProviderId,
      models: get().models,
      efforts: get().efforts,
      permissionMode: get().permissionMode,
    };
    const next: ChatDefaults = {
      ...previous,
      efforts: { ...previous.efforts, [modelId]: effort },
    };

    if (previous.efforts[modelId] === effort) {
      return;
    }

    const userId = useAuthStore.getState().status?.user?.id;

    set({ ...next, status: "ready" });

    try {
      const response = await fetch("/api/settings/chat-defaults", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
        },
        body: JSON.stringify(next),
      });

      if (!response.ok) {
        throw new Error("Unable to save chat defaults");
      }
    } catch (error) {
      if (userId === useAuthStore.getState().status?.user?.id) {
        set(previous);
      }

      console.error("Unable to save chat defaults", error);
    }
  },
  saveBehavior: async (messageBehavior) => {
    const previous = get().messageBehavior;
    const userId = useAuthStore.getState().status?.user?.id;
    set({ messageBehavior });
    const next: ChatDefaults = {
      messageBehavior,
      defaultProviderId: get().defaultProviderId,
      models: get().models,
      efforts: get().efforts,
      permissionMode: get().permissionMode,
    };

    try {
      const response = await fetch("/api/settings/chat-defaults", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
        },
        body: JSON.stringify(next),
      });

      if (!response.ok) {
        throw new Error("Unable to save message behavior");
      }
    } catch (error) {
      if (userId === useAuthStore.getState().status?.user?.id) {
        set({ messageBehavior: previous });
      }
      throw error;
    }
  },
  savePermission: async (mode) => {
    const previous: ChatDefaults = {
      messageBehavior: get().messageBehavior,
      defaultProviderId: get().defaultProviderId,
      models: get().models,
      efforts: get().efforts,
      permissionMode: get().permissionMode,
    };
    const next: ChatDefaults = { ...previous, permissionMode: mode };

    if (previous.permissionMode === mode) {
      return;
    }

    const userId = useAuthStore.getState().status?.user?.id;

    set({ ...next, status: "ready" });

    try {
      const response = await fetch("/api/settings/chat-defaults", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
        },
        body: JSON.stringify(next),
      });

      if (!response.ok) {
        throw new Error("Unable to save chat defaults");
      }
    } catch (error) {
      if (userId === useAuthStore.getState().status?.user?.id) {
        set(previous);
      }

      console.error("Unable to save chat defaults", error);
    }
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.status?.user?.id !== previous.status?.user?.id) {
    ++loadVersion;
    useChatDefaultsStore.setState({
      messageBehavior: "queue",
      defaultProviderId: "",
      models: {},
      efforts: {},
      permissionMode: "promptUnmatched",
      status: "idle",
    });
  }
});
