import { create } from "zustand";
import type {
  ChatApprovalRequest,
  ChatHistoryItem,
  ChatModelCatalog,
  ChatPermission,
  ChatSummary,
  DecideApprovalRequest,
  UpdateChatSettingsRequest,
} from "@veykor/shared";
import {
  cancelTurn as cancelTurnRequest,
  createChat,
  decideApproval as decideApprovalRequest,
  deleteChat as deleteChatRequest,
  fetchChat,
  fetchChats,
  fetchModels,
  moveChat as moveChatRequest,
  renameChat as renameChatRequest,
  streamTurn,
  updateSettings,
} from "./chat-client.ts";
import type { TurnImageInput } from "./chat-client.ts";

export interface ComposerImage {
  id: string;
  name: string;
  mediaType: string;
  base64Data: string;
  previewUrl: string;
}

interface ChatState {
  chats: Array<ChatSummary>;
  chatsLoaded: boolean;
  activeChatId: string | null;
  pendingSectionId: string;
  items: Array<ChatHistoryItem>;
  historyLoading: boolean;
  streaming: boolean;
  streamingTurnId: string;
  error: string;
  pendingApprovals: Array<ChatApprovalRequest>;
  todos: Array<Record<string, unknown>>;
  modelId: string;
  providerId: string;
  reasoningEffort: string;
  permission: ChatPermission;
  draftSeq: number;
  composerImages: Array<ComposerImage>;
  catalog: ChatModelCatalog | null;
  catalogLoading: boolean;
  loadChats: () => Promise<void>;
  startDraft: (sectionId: string) => void;
  openChat: (id: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  cancelTurn: () => Promise<void>;
  decideApproval: (
    approvalId: string,
    choiceId: string,
    feedback?: string,
  ) => Promise<void>;
  loadCatalog: (chatId?: string) => Promise<void>;
  setModel: (modelId: string, providerId: string) => void;
  setReasoningEffort: (effort: string) => void;
  setPermission: (permission: ChatPermission) => void;
  addImages: (files: FileList | Array<File>) => void;
  removeImage: (id: string) => void;
  renameChat: (id: string, title: string) => Promise<void>;
  moveChat: (id: string, sectionId: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  clearError: () => void;
}

let chatsLoading = false;

let openingChatId: string | null = null;

const maxComposerImages = 4;

const maxImageBytes = 6 * 1024 * 1024;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function upsertItem(
  items: Array<ChatHistoryItem>,
  next: ChatHistoryItem,
): Array<ChatHistoryItem> {
  const index = items.findIndex((item) => item.itemId === next.itemId);

  if (index === -1) {
    return [...items, next];
  }

  return items.map((item, position) => (position === index ? next : item));
}

function applyDelta(
  item: ChatHistoryItem,
  field: string,
  delta: string,
): ChatHistoryItem {
  if (field === "" || field === "text") {
    return { ...item, text: item.text + delta };
  }

  if (field === "output") {
    return { ...item, visibleOutput: item.visibleOutput + delta };
  }

  if (field.startsWith("summary.")) {
    const index = Number(field.slice("summary.".length));

    if (!Number.isInteger(index) || index < 0 || index >= item.summary.length) {
      return item;
    }

    return {
      ...item,
      summary: item.summary.map((entry, position) =>
        position === index ? entry + delta : entry,
      ),
    };
  }

  return item;
}

function revokeImages(images: Array<ComposerImage>): void {
  for (const image of images) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

export const useChatStore = create<ChatState>()((set, get) => ({
  chats: [],
  chatsLoaded: false,
  activeChatId: null,
  pendingSectionId: "recent",
  items: [],
  historyLoading: false,
  streaming: false,
  streamingTurnId: "",
  error: "",
  pendingApprovals: [],
  todos: [],
  modelId: "",
  providerId: "",
  reasoningEffort: "",
  permission: "read-only",
  draftSeq: 0,
  composerImages: [],
  catalog: null,
  catalogLoading: false,

  loadChats: async () => {
    if (chatsLoading) {
      return;
    }

    chatsLoading = true;

    try {
      const chats = await fetchChats();

      set({ chats, chatsLoaded: true });
    } catch (cause) {
      set({ error: errorMessage(cause, "Unable to load chats.") });
    } finally {
      chatsLoading = false;
    }
  },

  startDraft: (sectionId) => {
    const state = get();

    revokeImages(state.composerImages);

    set({
      activeChatId: null,
      pendingSectionId: sectionId,
      draftSeq: state.draftSeq + 1,
      items: [],
      historyLoading: false,
      streaming: false,
      streamingTurnId: "",
      error: "",
      pendingApprovals: [],
      todos: [],
      composerImages: [],
    });
  },

  openChat: async (id) => {
    const state = get();

    if (state.historyLoading || openingChatId === id) {
      return;
    }

    openingChatId = id;

    set({
      activeChatId: id,
      historyLoading: true,
      items: [],
      pendingApprovals: [],
      todos: [],
      error: "",
    });

    try {
      const detail = await fetchChat(id);

      if (get().activeChatId !== id) {
        return;
      }

      const patch: Partial<ChatState> = {
        items: detail.items,
        pendingApprovals: detail.pendingApprovals,
        permission: detail.permission,
        historyLoading: false,
        error: "",
      };

      if (detail.modelId !== "") {
        patch.modelId = detail.modelId;
        patch.providerId = detail.providerId;
      }

      if (detail.reasoningEffort !== "") {
        patch.reasoningEffort = detail.reasoningEffort;
      }

      set(patch);
    } catch (cause) {
      if (get().activeChatId === id) {
        set({
          historyLoading: false,
          error: errorMessage(cause, "Unable to open chat."),
        });
      }
    } finally {
      if (openingChatId === id) {
        openingChatId = null;
      }
    }
  },

  send: async (text) => {
    const state = get();

    if (state.streaming) {
      return;
    }

    const trimmed = text.trim();
    const images = state.composerImages;

    if (trimmed === "" && images.length === 0) {
      return;
    }

    set({ streaming: true, streamingTurnId: "", error: "" });

    revokeImages(images);
    set({ composerImages: [] });

    const payload: Array<TurnImageInput> = images.map((image) => ({
      mediaType: image.mediaType,
      base64Data: image.base64Data,
    }));

    try {
      let chatId = get().activeChatId;

      if (chatId === null) {
        const detail = await createChat(get().pendingSectionId);

        chatId = detail.chat.id;

        set((current) => ({
          activeChatId: chatId,
          chats: [detail.chat, ...current.chats],
          items: detail.items,
          pendingApprovals: detail.pendingApprovals,
        }));
      }

      const settings: UpdateChatSettingsRequest = {};
      const current = get();

      if (current.modelId !== "") {
        settings.modelId = current.modelId;
        settings.providerId = current.providerId;
      }

      if (current.reasoningEffort !== "") {
        settings.reasoningEffort = current.reasoningEffort;
      }

      settings.permission = current.permission;

      if (
        settings.modelId !== undefined ||
        settings.reasoningEffort !== undefined ||
        settings.permission !== undefined
      ) {
        try {
          await updateSettings(chatId, settings);
        } catch {
          // Best effort; the turn still goes ahead.
        }
      }

      await streamTurn(chatId, trimmed, payload, (event) => {
        switch (event.type) {
          case "turn-started":
            set({ streamingTurnId: event.turnId });
            break;

          case "item":
            set((currentItems) => ({
              items: upsertItem(currentItems.items, event.item),
            }));
            break;

          case "delta":
            set((currentItems) => ({
              items: currentItems.items.map((item) =>
                item.itemId === event.itemId
                  ? applyDelta(item, event.field, event.delta)
                  : item,
              ),
            }));
            break;

          case "approval":
            set((currentApprovals) =>
              currentApprovals.pendingApprovals.some(
                (approval) => approval.approvalId === event.approval.approvalId,
              )
                ? currentApprovals
                : {
                    pendingApprovals: [
                      ...currentApprovals.pendingApprovals,
                      event.approval,
                    ],
                  },
            );
            break;

          case "approval-resolved":
            set((currentApprovals) => ({
              pendingApprovals: currentApprovals.pendingApprovals.filter(
                (approval) => approval.approvalId !== event.approvalId,
              ),
            }));
            break;

          case "todos":
            set({ todos: event.todos });
            break;

          case "turn-completed":
            set({ streaming: false, streamingTurnId: "" });
            void get().loadChats();
            break;

          case "error":
            break;
        }
      });

      set({ streaming: false, streamingTurnId: "" });
    } catch (cause) {
      set({
        streaming: false,
        streamingTurnId: "",
        error: errorMessage(cause, "Unable to send message."),
      });
    }
  },

  cancelTurn: async () => {
    const state = get();

    if (state.activeChatId === null || state.streamingTurnId === "") {
      return;
    }

    try {
      await cancelTurnRequest(state.activeChatId, state.streamingTurnId);

      set({ streaming: false, streamingTurnId: "", error: "" });
    } catch (cause) {
      set({ error: errorMessage(cause, "Unable to cancel turn.") });
    }
  },

  decideApproval: async (approvalId, choiceId, feedback) => {
    const state = get();

    if (state.activeChatId === null) {
      return;
    }

    const req: DecideApprovalRequest = { approvalId, choiceId };

    if (feedback !== undefined && feedback !== "") {
      req.feedback = feedback;
    }

    try {
      await decideApprovalRequest(state.activeChatId, req);

      set((current) => ({
        pendingApprovals: current.pendingApprovals.filter(
          (approval) => approval.approvalId !== approvalId,
        ),
        error: "",
      }));
    } catch (cause) {
      set({ error: errorMessage(cause, "Unable to decide approval.") });
    }
  },

  loadCatalog: async (chatId) => {
    set({ catalogLoading: true });

    try {
      const catalog = await fetchModels(chatId);

      set({ catalog, catalogLoading: false });
    } catch (cause) {
      set({
        catalogLoading: false,
        error: errorMessage(cause, "Unable to load models."),
      });
    }
  },

  setModel: (modelId, providerId) => {
    set({ modelId, providerId });

    const state = get();

    if (state.activeChatId !== null) {
      updateSettings(state.activeChatId, { modelId, providerId }).catch(
        (cause: unknown) => {
          set({ error: errorMessage(cause, "Unable to save model.") });
        },
      );
    }
  },

  setReasoningEffort: (effort) => {
    set({ reasoningEffort: effort });

    const state = get();

    if (state.activeChatId !== null) {
      updateSettings(state.activeChatId, { reasoningEffort: effort }).catch(
        (cause: unknown) => {
          set({ error: errorMessage(cause, "Unable to save settings.") });
        },
      );
    }
  },

  setPermission: (permission) => {
    set({ permission });

    const state = get();

    if (state.activeChatId !== null) {
      updateSettings(state.activeChatId, { permission }).catch(
        (cause: unknown) => {
          set({ error: errorMessage(cause, "Unable to save settings.") });
        },
      );
    }
  },

  addImages: (files) => {
    const list = Array.isArray(files) ? files : Array.from(files);
    const state = get();

    const remaining = maxComposerImages - state.composerImages.length;

    if (remaining <= 0) {
      set({ error: "Attach up to 4 images." });
      return;
    }

    const accepted = list.slice(0, remaining);

    if (list.length > remaining) {
      set({ error: "Attach up to 4 images." });
    }

    for (const file of accepted) {
      if (!file.type.startsWith("image/")) {
        set({ error: `"${file.name}" is not an image.` });
        continue;
      }

      if (file.size > maxImageBytes) {
        set({ error: `"${file.name}" is larger than 6MB.` });
        continue;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result;

        if (typeof result !== "string") {
          set({ error: `Unable to read "${file.name}".` });
          return;
        }

        const comma = result.indexOf(",");
        const base64Data = comma === -1 ? "" : result.slice(comma + 1);

        if (base64Data === "") {
          set({ error: `Unable to read "${file.name}".` });
          return;
        }

        const image: ComposerImage = {
          id: crypto.randomUUID(),
          name: file.name,
          mediaType: file.type,
          base64Data,
          previewUrl: URL.createObjectURL(file),
        };

        set((current) => {
          if (current.composerImages.length >= maxComposerImages) {
            URL.revokeObjectURL(image.previewUrl);

            return { error: "Attach up to 4 images." };
          }

          return {
            composerImages: [...current.composerImages, image],
            error: "",
          };
        });
      };

      reader.onerror = () => {
        set({ error: `Unable to read "${file.name}".` });
      };

      reader.readAsDataURL(file);
    }
  },

  removeImage: (id) => {
    const state = get();
    const image = state.composerImages.find((entry) => entry.id === id);

    if (image !== undefined) {
      URL.revokeObjectURL(image.previewUrl);
    }

    set({
      composerImages: state.composerImages.filter((entry) => entry.id !== id),
    });
  },

  renameChat: async (id, title) => {
    try {
      const summary = await renameChatRequest(id, title);

      set((current) => ({
        chats: current.chats.map((chat) => (chat.id === id ? summary : chat)),
        error: "",
      }));
    } catch (cause) {
      set({ error: errorMessage(cause, "Unable to rename chat.") });
    }
  },

  moveChat: async (id, sectionId) => {
    try {
      const summary = await moveChatRequest(id, sectionId);

      set((current) => ({
        chats: current.chats.map((chat) => (chat.id === id ? summary : chat)),
        error: "",
      }));
    } catch (cause) {
      set({ error: errorMessage(cause, "Unable to move chat.") });
    }
  },

  deleteChat: async (id) => {
    try {
      await deleteChatRequest(id);

      const state = get();

      if (state.activeChatId === id) {
        revokeImages(state.composerImages);

        set({
          chats: state.chats.filter((chat) => chat.id !== id),
          activeChatId: null,
          items: [],
          historyLoading: false,
          streaming: false,
          streamingTurnId: "",
          pendingApprovals: [],
          todos: [],
          composerImages: [],
          error: "",
        });
      } else {
        set({
          chats: state.chats.filter((chat) => chat.id !== id),
          error: "",
        });
      }
    } catch (cause) {
      set({ error: errorMessage(cause, "Unable to delete chat.") });
    }
  },

  clearError: () => {
    set({ error: "" });
  },
}));
