import { create } from "zustand";
import type { CollabDetailResponse, CollabSnapshot } from "@veykor/shared";
import { useAuthStore } from "../auth/auth-store";
import { useChatSessionsStore } from "./chat-sessions-store";

interface CollabState {
  parentId: string;
  snapshot: CollabSnapshot | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  openTabs: string[];
  selectedTab: string;
  mobileDelegateOpen: boolean;
  load: (parentId: string) => Promise<void>;
  refresh: () => Promise<void>;
  openTab: (conversationId: string) => void;
  closeTab: (conversationId: string) => void;
  selectTab: (conversationId: string) => void;
  setMobileDelegateOpen: (open: boolean) => void;
  interrupt: (taskId: string) => Promise<boolean>;
}

interface StoredTabState {
  tabs: string[];
  selected: string;
}

function storedTabs(parentId: string): StoredTabState {
  const empty: StoredTabState = { tabs: [], selected: "" };

  try {
    const raw = localStorage.getItem(`veykor:collab-tabs:${parentId}`);

    if (!raw) {
      return empty;
    }

    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const tabs = parsed.filter(
        (entry): entry is string => typeof entry === "string",
      );

      return { tabs, selected: tabs[0] || "" };
    }

    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as { tabs?: unknown; selected?: unknown };
      const tabs = Array.isArray(record.tabs)
        ? record.tabs.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];

      return {
        tabs,
        selected:
          typeof record.selected === "string" && tabs.includes(record.selected)
            ? record.selected
            : tabs[0] || "",
      };
    }

    return empty;
  } catch {
    return empty;
  }
}

function persistTabs(parentId: string, tabs: string[], selected: string) {
  try {
    localStorage.setItem(
      `veykor:collab-tabs:${parentId}`,
      JSON.stringify({ tabs, selected }),
    );
  } catch {
    return;
  }
}

let pollTimer: ReturnType<typeof setInterval> | undefined;
let pollParent = "";
let detailWanted = false;

async function fetchSnapshot(parentId: string) {
  const response = await fetch(
    `/api/chat/collab/${encodeURIComponent(parentId)}`,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to load collaboration");
  }

  return ((await response.json()) as { snapshot: CollabSnapshot }).snapshot;
}

async function fetchDetail(parentId: string) {
  const response = await fetch(
    `/api/chat/collab/${encodeURIComponent(parentId)}/detail`,
  );

  if (!response.ok) {
    throw new Error("Unable to load delegate conversations");
  }

  return (await response.json()) as CollabDetailResponse;
}

function stopPolling() {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }

  pollParent = "";
}

function startPolling(parentId: string) {
  if (pollParent === parentId && pollTimer !== undefined) {
    return;
  }

  stopPolling();
  pollParent = parentId;
  pollTimer = setInterval(() => {
    const state = useCollabStore.getState();

    if (state.parentId !== parentId) {
      return;
    }

    void state.refresh();
  }, 2500);
}

export const useCollabStore = create<CollabState>()((set, get) => ({
  parentId: "",
  snapshot: null,
  status: "idle",
  error: "",
  openTabs: [],
  selectedTab: "",
  mobileDelegateOpen: false,

  load: async (parentId) => {
    if (!parentId) {
      stopPolling();
      detailWanted = false;
      useChatSessionsStore.getState().clearInternal();
      set({
        parentId: "",
        snapshot: null,
        status: "idle",
        error: "",
        openTabs: [],
        selectedTab: "",
        mobileDelegateOpen: false,
      });
      return;
    }

    if (get().parentId !== parentId) {
      const stored = storedTabs(parentId);

      useChatSessionsStore.getState().clearInternal();

      set({
        parentId,
        snapshot: null,
        status: "loading",
        error: "",
        openTabs: stored.tabs,
        selectedTab: stored.selected,
        mobileDelegateOpen: false,
      });
    }

    startPolling(parentId);
    await get().refresh();
  },

  refresh: async () => {
    const parentId = get().parentId;

    if (!parentId) {
      return;
    }

    const userId = useAuthStore.getState().status?.user?.id;

    try {
      if (detailWanted || get().openTabs.length > 0) {
        const detail = await fetchDetail(parentId);

        if (
          useAuthStore.getState().status?.user?.id !== userId ||
          get().parentId !== parentId
        ) {
          return;
        }

        useChatSessionsStore
          .getState()
          .receiveInternal(detail.sessions.map((entry) => entry.session));

        const valid = new Set(
          detail.snapshot.participants.map(
            (participant) => participant.conversationId,
          ),
        );
        const openTabs = get().openTabs.filter((tab) => valid.has(tab));
        const selectedTab =
          openTabs.includes(get().selectedTab) && get().selectedTab
            ? get().selectedTab
            : openTabs[0] || "";

        if (openTabs.join() !== get().openTabs.join()) {
          persistTabs(parentId, openTabs, selectedTab);
        }

        set({
          snapshot: detail.snapshot,
          status: "ready",
          error: "",
          openTabs,
          selectedTab,
        });
      } else {
        const snapshot = await fetchSnapshot(parentId);

        if (
          useAuthStore.getState().status?.user?.id !== userId ||
          get().parentId !== parentId
        ) {
          return;
        }

        if (!snapshot) {
          set({ snapshot: null, status: "ready", error: "" });
          return;
        }

        set({ snapshot, status: "ready", error: "" });
      }
    } catch (error) {
      console.error("Unable to load collaboration", error);

      if (get().parentId === parentId) {
        set({ status: "error", error: "Collaboration updates unavailable." });
      }
    }
  },

  openTab: (conversationId) => {
    const parentId = get().parentId;

    if (!parentId || !conversationId) {
      return;
    }

    detailWanted = true;

    const openTabs = get().openTabs.includes(conversationId)
      ? get().openTabs
      : [...get().openTabs, conversationId];

    persistTabs(parentId, openTabs, conversationId);
    set({ openTabs, selectedTab: conversationId });
    void get().refresh();
  },

  closeTab: (conversationId) => {
    const parentId = get().parentId;
    const openTabs = get().openTabs.filter((tab) => tab !== conversationId);
    const selectedTab =
      get().selectedTab === conversationId
        ? openTabs[0] || ""
        : get().selectedTab;

    if (parentId) {
      persistTabs(parentId, openTabs, selectedTab);
    }

    if (openTabs.length === 0) {
      detailWanted = false;
    }

    set({
      openTabs,
      selectedTab,
      mobileDelegateOpen: openTabs.length > 0 && get().mobileDelegateOpen,
    });
  },

  selectTab: (conversationId) => {
    if (get().openTabs.includes(conversationId)) {
      const parentId = get().parentId;

      if (parentId) {
        persistTabs(parentId, get().openTabs, conversationId);
      }

      set({ selectedTab: conversationId });
    }
  },

  setMobileDelegateOpen: (open) => {
    set({ mobileDelegateOpen: open });
  },

  interrupt: async (taskId) => {
    const response = await fetch(
      `/api/chat/collab/tasks/${encodeURIComponent(taskId)}/interrupt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Veykor-Request": "1",
        },
        body: JSON.stringify({}),
      },
    );

    if (!response.ok) {
      return false;
    }

    void get().refresh();

    return true;
  },
}));

export function stopCollabPolling() {
  stopPolling();
  detailWanted = false;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopCollabPolling();
  });
}
