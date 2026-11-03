import { create } from "zustand";
import {
  defaultPreferences,
  recentSectionId,
  defaultProjectSectionId,
} from "@veykor/shared";
import type {
  ChatPermission,
  InterruptionBehavior,
  PreferredModel,
  SidebarSection,
  SidebarTab,
  UserPreferences,
} from "@veykor/shared";
import { defaultChats } from "./chats.ts";
import { fetchPreferences, savePreferences } from "./preferences-client.ts";

interface PreferencesState extends UserPreferences {
  loaded: boolean;
  loading: boolean;
  error: string;
  load: () => Promise<void>;
  setLastTab: (tab: SidebarTab) => void;
  setSectionOpen: (id: string, open: boolean) => void;
  collapseAll: () => void;
  addSection: (title: string) => void;
  renameSection: (id: string, title: string) => void;
  deleteSection: (id: string) => void;
  moveChat: (chatId: string, sectionId: string) => void;
  renameChat: (chatId: string, title: string) => void;
  deleteChat: (chatId: string) => void;
  addChat: (sectionId: string) => void;
  setPreferredModel: (tab: SidebarTab, model: PreferredModel | null) => void;
  setPreferredEffort: (
    tab: SidebarTab,
    modelKey: string,
    effort: string,
  ) => void;
  setPreferredPermission: (permission: ChatPermission) => void;
  setInterruptionBehavior: (behavior: InterruptionBehavior) => void;
}

const initialSections = defaultPreferences().sections;

let saveQueue: Promise<void> = Promise.resolve();

function persist(): void {
  const state = usePreferencesStore.getState();

  const snapshot: UserPreferences = {
    lastTab: state.lastTab,
    sections: state.sections,
    workSections: state.workSections,
    chatSections: state.chatSections,
    chatTitles: state.chatTitles,
    customChats: state.customChats,
    removedChatIds: state.removedChatIds,
    preferredModels: state.preferredModels,
    preferredEfforts: state.preferredEfforts,
    preferredPermission: state.preferredPermission,
    interruptionBehavior: state.interruptionBehavior,
  };

  saveQueue = saveQueue.then(async () => {
    try {
      await savePreferences(snapshot);

      usePreferencesStore.setState({ error: "" });
    } catch (cause) {
      usePreferencesStore.setState({
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to save preferences.",
      });
    }
  });
}

export const usePreferencesStore = create<PreferencesState>()((set, get) => ({
  ...defaultPreferences(),
  sections: initialSections,
  loaded: false,
  loading: false,
  error: "",

  load: async () => {
    const state = get();

    if (state.loaded || state.loading) {
      return;
    }

    set({ loading: true, error: "" });

    try {
      const stored = await fetchPreferences();

      const sections: Array<SidebarSection> = stored.sections.some(
        (section) => section.id === recentSectionId,
      )
        ? stored.sections
        : [
            { id: recentSectionId, title: "Recent", open: true },
            ...stored.sections,
          ];

      set({
        ...stored,
        sections,
        loaded: true,
        loading: false,
      });
    } catch (cause) {
      set({
        loading: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to load preferences.",
      });
    }
  },

  setLastTab: (tab) => {
    set({ lastTab: tab, error: "" });
    persist();
  },

  setSectionOpen: (id, open) => {
    const key = get().lastTab === "work" ? "workSections" : "sections";

    set((state) => ({
      [key]: state[key].map((section) =>
        section.id === id ? { ...section, open } : section,
      ),
      error: "",
    }));
    persist();
  },

  collapseAll: () => {
    const key = get().lastTab === "work" ? "workSections" : "sections";

    set((state) => ({
      [key]: state[key].map((section) => ({ ...section, open: false })),
      error: "",
    }));
    persist();
  },

  addSection: (title) => {
    const key = get().lastTab === "work" ? "workSections" : "sections";

    set((state) => ({
      [key]: [...state[key], { id: crypto.randomUUID(), title, open: true }],
      error: "",
    }));
    persist();
  },

  renameSection: (id, title) => {
    const key = get().lastTab === "work" ? "workSections" : "sections";

    set((state) => ({
      [key]: state[key].map((section) =>
        section.id === id ? { ...section, title } : section,
      ),
      error: "",
    }));
    persist();
  },

  deleteSection: (id) => {
    if (id === recentSectionId || id === defaultProjectSectionId) {
      return;
    }

    if (get().lastTab === "work") {
      set((state) => ({
        workSections: state.workSections.filter((section) => section.id !== id),
        error: "",
      }));
      persist();
      return;
    }

    const state = get();
    const fallback = state.sections[0]?.id ?? "";

    const removed = [...defaultChats, ...state.customChats]
      .filter((chat) => (state.chatSections[chat.id] ?? fallback) === id)
      .map((chat) => chat.id);

    const removedChatIds = [...state.removedChatIds];

    for (const chatId of removed) {
      if (!removedChatIds.includes(chatId)) {
        removedChatIds.push(chatId);
      }
    }

    const chatSections = { ...state.chatSections };
    const chatTitles = { ...state.chatTitles };

    for (const chatId of removed) {
      delete chatSections[chatId];
      delete chatTitles[chatId];
    }

    set({
      sections: state.sections.filter((section) => section.id !== id),
      chatSections,
      chatTitles,
      removedChatIds,
      error: "",
    });
    persist();
  },

  moveChat: (chatId, sectionId) => {
    set((state) => ({
      chatSections: { ...state.chatSections, [chatId]: sectionId },
      error: "",
    }));
    persist();
  },

  renameChat: (chatId, title) => {
    set((state) => ({
      chatTitles: { ...state.chatTitles, [chatId]: title },
      error: "",
    }));
    persist();
  },

  deleteChat: (chatId) => {
    set((state) => {
      const removedChatIds = state.removedChatIds.includes(chatId)
        ? state.removedChatIds
        : [...state.removedChatIds, chatId];

      const chatSections = { ...state.chatSections };
      const chatTitles = { ...state.chatTitles };

      delete chatSections[chatId];
      delete chatTitles[chatId];

      return { chatSections, chatTitles, removedChatIds, error: "" };
    });
    persist();
  },

  addChat: (sectionId) => {
    const state = get();

    const taken = new Set(
      [...defaultChats, ...state.customChats].map(
        (chat) => state.chatTitles[chat.id] ?? chat.title,
      ),
    );

    let title = "Untitled chat";
    let counter = 2;

    while (taken.has(title)) {
      title = `Untitled chat ${counter}`;
      counter += 1;
    }

    const id = crypto.randomUUID();

    set((current) => ({
      customChats: [...current.customChats, { id, title }],
      chatSections: { ...current.chatSections, [id]: sectionId },
      error: "",
    }));
    persist();
  },

  setPreferredModel: (tab, model) => {
    set((state) => ({
      preferredModels: { ...state.preferredModels, [tab]: model },
      error: "",
    }));
    persist();
  },

  setPreferredEffort: (tab, modelKey, effort) => {
    set((state) => ({
      preferredEfforts: {
        ...state.preferredEfforts,
        [tab]: { ...state.preferredEfforts[tab], [modelKey]: effort },
      },
      error: "",
    }));
    persist();
  },

  setPreferredPermission: (permission) => {
    set({ preferredPermission: permission, error: "" });
    persist();
  },

  setInterruptionBehavior: (behavior) => {
    set({ interruptionBehavior: behavior, error: "" });
    persist();
  },
}));
