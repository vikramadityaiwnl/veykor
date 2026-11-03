import { create } from "zustand";
import { preferredEffortKey } from "@veykor/shared";
import type {
  ChatApprovalRequest,
  ChatHistoryItem,
  ChatModelCatalog,
  ChatPermission,
  ChatSummary,
  DecideApprovalRequest,
  UpdateChatSettingsRequest,
} from "@veykor/shared";
import { usePreferencesStore } from "../workspace/preferences-store.ts";
import {
  HttpError,
  cancelTurn as cancelTurnRequest,
  createChat,
  decideApproval as decideApprovalRequest,
  deleteChat as deleteChatRequest,
  fetchChat,
  fetchChats,
  fetchModels,
  moveChat as moveChatRequest,
  renameChat as renameChatRequest,
  steerTurn as steerTurnRequest,
  streamTurn,
  updateSettings,
} from "./chat-client.ts";
import type { TurnImageInput } from "./chat-client.ts";
import {
  appendChatAttachmentIds,
  blobFromBase64,
  deleteChatAttachments,
  readAttachment,
  readChatAttachmentIds,
  saveAttachment,
} from "./attachment-store.ts";

export interface ComposerImage {
  id: string;
  name: string;
  mediaType: string;
  base64Data: string;
  previewUrl: string;
}

export interface SentAttachment {
  id: string;
  url: string;
}

export interface QueuedMessage {
  id: string;
  text: string;
  images: Array<TurnImageInput>;
}

export interface ComposerRestore {
  seq: number;
  text: string;
}

interface ChatState {
  chats: Array<ChatSummary>;
  chatsLoaded: boolean;
  activeChatId: string | null;
  pendingRoutePush: string | null;
  clearRoutePush: () => void;
  pendingSectionId: string;
  items: Array<ChatHistoryItem>;
  historyLoading: boolean;
  chatNotFound: boolean;
  streaming: boolean;
  streamingTurnId: string;
  error: string;
  pendingApprovals: Array<ChatApprovalRequest>;
  turnDurations: Record<string, number>;
  thinkingSnapshots: Record<string, Array<string>>;
  todos: Array<Record<string, unknown>>;
  modelId: string;
  providerId: string;
  reasoningEffort: string;
  permission: ChatPermission;
  draftSeq: number;
  composerImages: Array<ComposerImage>;
  sentAttachments: Record<string, Array<SentAttachment>>;
  queuedMessages: Array<QueuedMessage>;
  composerRestore: ComposerRestore;
  catalog: ChatModelCatalog | null;
  catalogLoading: boolean;
  loadChats: () => Promise<void>;
  startDraft: (sectionId: string) => void;
  syncDraftPreferences: () => void;
  openChat: (id: string) => Promise<void>;
  hydrateAttachments: (chatId: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  steerQueuedMessage: (id: string) => Promise<void>;
  editQueuedMessage: (id: string) => void;
  removeQueuedMessage: (id: string) => void;
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

const approvalGraceMs = 600;

const approvalTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearApprovalTimer(approvalId: string): void {
  const timer = approvalTimers.get(approvalId);

  if (timer !== undefined) {
    window.clearTimeout(timer);
    approvalTimers.delete(approvalId);
  }
}

function clearApprovalTimers(): void {
  for (const approvalId of approvalTimers.keys()) {
    clearApprovalTimer(approvalId);
  }
}

const maxComposerImages = 4;

const maxImageBytes = 6 * 1024 * 1024;

const maxOpenAttempts = 3;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function upsertItem(
  items: Array<ChatHistoryItem>,
  next: ChatHistoryItem,
): Array<ChatHistoryItem> {
  const index = items.findIndex((item) => item.itemId === next.itemId);

  if (index === -1) {
    return [...items, next];
  }

  return items.map((item, position) => {
    if (position !== index) {
      return item;
    }

    return {
      ...next,
      text: next.text !== "" ? next.text : item.text,
      summary: next.summary.length > 0 ? next.summary : item.summary,
      visibleOutput:
        next.visibleOutput !== "" ? next.visibleOutput : item.visibleOutput,
      args: next.args !== "" ? next.args : item.args,
      displayLabel:
        next.displayLabel !== "" ? next.displayLabel : item.displayLabel,
    };
  });
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

    if (!Number.isInteger(index) || index < 0) {
      return item;
    }

    const summary = [...item.summary];

    while (summary.length <= index) {
      summary.push("");
    }

    summary[index] += delta;

    return { ...item, summary };
  }

  return item;
}

function summarySize(summary: Array<string>): number {
  return summary.reduce((total, part) => total + part.length, 0);
}

function revokeImages(images: Array<ComposerImage>): void {
  for (const image of images) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

function rehydrateQueuedImages(
  images: Array<TurnImageInput>,
): Array<ComposerImage> {
  return images.map((image) => ({
    id: crypto.randomUUID(),
    name: "queued-image",
    mediaType: image.mediaType,
    base64Data: image.base64Data,
    previewUrl: URL.createObjectURL(
      blobFromBase64(image.base64Data, image.mediaType),
    ),
  }));
}

function mergeComposerImages(
  current: Array<ComposerImage>,
  incoming: Array<ComposerImage>,
): Array<ComposerImage> {
  const merged = [...incoming, ...current];
  const kept = merged.slice(0, maxComposerImages);

  for (const extra of merged.slice(maxComposerImages)) {
    URL.revokeObjectURL(extra.previewUrl);
  }

  return kept;
}

async function persistSentImages(
  chatId: string,
  images: Array<ComposerImage>,
): Promise<void> {
  if (images.length === 0) {
    return;
  }

  const entries: Array<SentAttachment> = images.map((image) => ({
    id: image.id,
    url: image.previewUrl,
  }));

  try {
    for (const image of images) {
      await saveAttachment({
        blob: blobFromBase64(image.base64Data, image.mediaType),
        id: image.id,
        mediaType: image.mediaType,
        name: image.name,
      });
    }

    await appendChatAttachmentIds(
      chatId,
      images.map((image) => image.id),
    );
  } catch {
    // Best effort; the turn still goes ahead with live previews.
  }

  useChatStore.setState((stored) => ({
    sentAttachments: {
      ...stored.sentAttachments,
      [chatId]: [...(stored.sentAttachments[chatId] ?? []), ...entries],
    },
  }));
}

export const useChatStore = create<ChatState>()((set, get) => ({
  chats: [],
  chatsLoaded: false,
  activeChatId: null,
  pendingRoutePush: null,
  pendingSectionId: "recent",
  items: [],
  historyLoading: false,
  chatNotFound: false,
  streaming: false,
  streamingTurnId: "",
  error: "",
  pendingApprovals: [],
  turnDurations: {},
  thinkingSnapshots: {},
  todos: [],
  modelId: "",
  providerId: "",
  reasoningEffort: "",
  permission: "read-only",
  draftSeq: 0,
  composerImages: [],
  sentAttachments: {},
  queuedMessages: [],
  composerRestore: { seq: 0, text: "" },
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

  clearRoutePush: () => {
    set({ pendingRoutePush: null });
  },

  startDraft: (sectionId) => {
    const state = get();

    revokeImages(state.composerImages);
    clearApprovalTimers();

    set({
      activeChatId: null,
      pendingRoutePush: null,
      pendingSectionId: sectionId,
      draftSeq: state.draftSeq + 1,
      items: [],
      historyLoading: false,
      chatNotFound: false,
      streaming: false,
      streamingTurnId: "",
      error: "",
      pendingApprovals: [],
      todos: [],
      composerImages: [],
      queuedMessages: [],
      composerRestore: { seq: 0, text: "" },
    });

    get().syncDraftPreferences();
  },

  syncDraftPreferences: () => {
    const prefs = usePreferencesStore.getState();
    const tab = prefs.lastTab;
    const model = prefs.preferredModels[tab];

    const effort =
      model === null
        ? ""
        : (prefs.preferredEfforts[tab]?.[
            preferredEffortKey(model.providerId, model.modelId)
          ] ?? "");

    set({
      modelId: model?.modelId ?? "",
      providerId: model?.providerId ?? "",
      reasoningEffort: effort,
      permission: prefs.preferredPermission,
    });
  },

  openChat: async (id) => {
    if (openingChatId === id && get().activeChatId === id) {
      return;
    }

    openingChatId = id;
    clearApprovalTimers();

    set({
      activeChatId: id,
      pendingRoutePush: null,
      streaming: false,
      streamingTurnId: "",
      historyLoading: true,
      chatNotFound: false,
      items: [],
      pendingApprovals: [],
      todos: [],
      error: "",
      queuedMessages: [],
      composerRestore: { seq: 0, text: "" },
    });

    try {
      for (let attempt = 1; ; attempt += 1) {
        if (get().activeChatId !== id) {
          return;
        }

        try {
          const detail = await fetchChat(id);

          if (get().activeChatId !== id) {
            return;
          }

          const patch: Partial<ChatState> = {
            items: detail.items,
            turnDurations: detail.turnDurations,
            pendingApprovals: detail.pendingApprovals,
            permission: detail.permission,
            historyLoading: false,
            chatNotFound: false,
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

          void get().hydrateAttachments(id);

          return;
        } catch (cause) {
          const confirmedMissing =
            cause instanceof HttpError && cause.status === 404;

          if (
            confirmedMissing ||
            attempt >= maxOpenAttempts ||
            get().activeChatId !== id
          ) {
            if (get().activeChatId === id) {
              set({
                historyLoading: false,
                chatNotFound: confirmedMissing,
                error: confirmedMissing
                  ? ""
                  : errorMessage(cause, "Unable to open chat."),
              });
            }

            return;
          }

          await delay(1000 * attempt);
        }
      }
    } finally {
      if (openingChatId === id) {
        openingChatId = null;
      }
    }
  },

  hydrateAttachments: async (chatId) => {
    let ids: Array<string>;

    try {
      ids = await readChatAttachmentIds(chatId);
    } catch {
      return;
    }

    if (ids.length === 0) {
      return;
    }

    const kept = new Map(
      (get().sentAttachments[chatId] ?? []).map((entry) => [
        entry.id,
        entry.url,
      ]),
    );

    const resolved: Array<SentAttachment> = [];

    for (const id of ids) {
      const existing = kept.get(id);

      if (existing !== undefined && existing !== "") {
        resolved.push({ id, url: existing });
        continue;
      }

      try {
        const record = await readAttachment(id);

        resolved.push({
          id,
          url: record === null ? "" : URL.createObjectURL(record.blob),
        });
      } catch {
        resolved.push({ id, url: "" });
      }
    }

    set((stored) => ({
      sentAttachments: { ...stored.sentAttachments, [chatId]: resolved },
    }));
  },

  send: async (text) => {
    const state = get();

    if (state.streaming) {
      const running = get();

      const queuedText = text.trim();
      const queuedImages = running.composerImages;

      if (queuedText === "" && queuedImages.length === 0) {
        return;
      }

      const behavior = usePreferencesStore.getState().interruptionBehavior;

      if (
        behavior === "steer" &&
        running.activeChatId !== null &&
        running.streamingTurnId !== ""
      ) {
        const steerChatId = running.activeChatId;
        const expectedTurnId = running.streamingTurnId;

        const payload: Array<TurnImageInput> = queuedImages.map((image) => ({
          mediaType: image.mediaType,
          base64Data: image.base64Data,
        }));

        set({ composerImages: [] });

        try {
          await persistSentImages(steerChatId, queuedImages);

          await steerTurnRequest(steerChatId, {
            text: queuedText,
            expectedTurnId,
            images: payload,
          });

          set({ error: "" });
        } catch (cause) {
          set({ error: errorMessage(cause, "Unable to steer the turn.") });
        }

        return;
      }

      const entry: QueuedMessage = {
        id: crypto.randomUUID(),
        text: queuedText,
        images: queuedImages.map((image) => ({
          mediaType: image.mediaType,
          base64Data: image.base64Data,
        })),
      };

      revokeImages(queuedImages);

      set((current) => ({
        composerImages: [],
        queuedMessages: [...current.queuedMessages, entry],
        error: "",
      }));

      return;
    }

    const trimmed = text.trim();
    const images = state.composerImages;

    if (trimmed === "" && images.length === 0) {
      return;
    }

    const startedAt = Date.now();

    set({ streaming: true, streamingTurnId: "", error: "" });

    set({ composerImages: [] });

    const payload: Array<TurnImageInput> = images.map((image) => ({
      mediaType: image.mediaType,
      base64Data: image.base64Data,
    }));

    let chatId = get().activeChatId;
    let failed = false;

    try {
      if (chatId === null) {
        const detail = await createChat(get().pendingSectionId);

        chatId = detail.chat.id;

        set((current) => ({
          activeChatId: chatId,
          pendingRoutePush: chatId,
          chats: [detail.chat, ...current.chats],
          items: detail.items,
          turnDurations: detail.turnDurations,
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

      await persistSentImages(chatId, images);

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
        if (get().activeChatId !== chatId) {
          return;
        }

        switch (event.type) {
          case "turn-started":
            set({ streamingTurnId: event.turnId });
            break;

          case "item":
            set((currentItems) => {
              const items = upsertItem(currentItems.items, event.item);

              if (event.item.kind !== "reasoning") {
                return { items };
              }

              const kept =
                currentItems.thinkingSnapshots[event.item.itemId] ?? [];
              const incoming = event.item.summary;

              return {
                items,
                thinkingSnapshots:
                  summarySize(incoming) > summarySize(kept)
                    ? {
                        ...currentItems.thinkingSnapshots,
                        [event.item.itemId]: [...incoming],
                      }
                    : currentItems.thinkingSnapshots,
              };
            });
            break;

          case "delta":
            set((currentItems) => {
              const items = currentItems.items.map((item) =>
                item.itemId === event.itemId
                  ? applyDelta(item, event.field, event.delta)
                  : item,
              );

              const updated = items.find(
                (item) => item.itemId === event.itemId,
              );

              if (updated === undefined || updated.kind !== "reasoning") {
                return { items };
              }

              const kept = currentItems.thinkingSnapshots[updated.itemId] ?? [];

              return {
                items,
                thinkingSnapshots:
                  summarySize(updated.summary) > summarySize(kept)
                    ? {
                        ...currentItems.thinkingSnapshots,
                        [updated.itemId]: [...updated.summary],
                      }
                    : currentItems.thinkingSnapshots,
              };
            });
            break;

          case "approval": {
            const approval = event.approval;

            if (
              approvalTimers.has(approval.approvalId) ||
              get().pendingApprovals.some(
                (entry) => entry.approvalId === approval.approvalId,
              )
            ) {
              break;
            }

            approvalTimers.set(
              approval.approvalId,
              window.setTimeout(() => {
                approvalTimers.delete(approval.approvalId);

                set((currentApprovals) =>
                  currentApprovals.pendingApprovals.some(
                    (entry) => entry.approvalId === approval.approvalId,
                  )
                    ? currentApprovals
                    : {
                        pendingApprovals: [
                          ...currentApprovals.pendingApprovals,
                          approval,
                        ],
                      },
                );
              }, approvalGraceMs),
            );
            break;
          }

          case "approval-resolved":
            clearApprovalTimer(event.approvalId);

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
            set((current) => ({
              streaming: false,
              streamingTurnId: "",
              turnDurations: {
                ...current.turnDurations,
                [event.turnId]:
                  event.durationMs > 0
                    ? event.durationMs
                    : Math.max(1, Date.now() - startedAt),
              },
            }));
            void get().loadChats();
            break;

          case "error":
            break;
        }
      });

      if (get().activeChatId === chatId) {
        set({ streaming: false, streamingTurnId: "" });
      }
    } catch (cause) {
      failed = true;

      if (get().activeChatId === chatId) {
        set({
          streaming: false,
          streamingTurnId: "",
          error: errorMessage(cause, "Unable to send message."),
        });
      }
    }

    if (!failed) {
      const next = get().queuedMessages[0];

      if (
        next !== undefined &&
        get().activeChatId === chatId &&
        !get().streaming
      ) {
        set((current) => ({
          queuedMessages: current.queuedMessages.filter(
            (entry) => entry.id !== next.id,
          ),
          composerImages: mergeComposerImages(
            current.composerImages,
            rehydrateQueuedImages(next.images),
          ),
        }));

        await get().send(next.text);
      }
    }
  },

  steerQueuedMessage: async (id) => {
    const state = get();
    const entry = state.queuedMessages.find((item) => item.id === id);

    if (entry === undefined || state.activeChatId === null) {
      return;
    }

    if (!state.streaming || state.streamingTurnId === "") {
      set((current) => ({
        queuedMessages: current.queuedMessages.filter((item) => item.id !== id),
        composerImages: mergeComposerImages(
          current.composerImages,
          rehydrateQueuedImages(entry.images),
        ),
      }));

      await get().send(entry.text);

      return;
    }

    const steerChatId = state.activeChatId;
    const expectedTurnId = state.streamingTurnId;

    try {
      await persistSentImages(steerChatId, rehydrateQueuedImages(entry.images));

      await steerTurnRequest(steerChatId, {
        text: entry.text,
        expectedTurnId,
        images: entry.images,
      });

      set((current) => ({
        queuedMessages: current.queuedMessages.filter((item) => item.id !== id),
        error: "",
      }));
    } catch (cause) {
      set({ error: errorMessage(cause, "Unable to steer the turn.") });
    }
  },

  editQueuedMessage: (id) => {
    const state = get();
    const entry = state.queuedMessages.find((item) => item.id === id);

    if (entry === undefined) {
      return;
    }

    set((current) => ({
      queuedMessages: current.queuedMessages.filter((item) => item.id !== id),
      composerRestore: {
        seq: current.composerRestore.seq + 1,
        text: entry.text,
      },
      composerImages: mergeComposerImages(
        current.composerImages,
        rehydrateQueuedImages(entry.images),
      ),
    }));
  },

  removeQueuedMessage: (id) => {
    set((current) => ({
      queuedMessages: current.queuedMessages.filter((item) => item.id !== id),
    }));
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

      clearApprovalTimer(approvalId);

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
    const prefs = usePreferencesStore.getState();
    const tab = prefs.lastTab;

    prefs.setPreferredModel(tab, { modelId, providerId });

    const savedEffort =
      prefs.preferredEfforts[tab]?.[preferredEffortKey(providerId, modelId)] ??
      "";

    if (savedEffort !== "") {
      set({ modelId, providerId, reasoningEffort: savedEffort });
    } else {
      set({ modelId, providerId });
    }

    const state = get();

    if (state.activeChatId !== null) {
      const settings: UpdateChatSettingsRequest = { modelId, providerId };

      if (savedEffort !== "") {
        settings.reasoningEffort = savedEffort;
      }

      updateSettings(state.activeChatId, settings).catch((cause: unknown) => {
        set({ error: errorMessage(cause, "Unable to save model.") });
      });
    }
  },

  setReasoningEffort: (effort) => {
    set({ reasoningEffort: effort });

    const state = get();
    const prefs = usePreferencesStore.getState();

    prefs.setPreferredEffort(
      prefs.lastTab,
      preferredEffortKey(state.providerId, state.modelId),
      effort,
    );

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

    usePreferencesStore.getState().setPreferredPermission(permission);

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

      for (const entry of state.sentAttachments[id] ?? []) {
        if (entry.url !== "") {
          URL.revokeObjectURL(entry.url);
        }
      }

      set((stored) => {
        const sentAttachments = { ...stored.sentAttachments };

        delete sentAttachments[id];

        return { sentAttachments };
      });

      void deleteChatAttachments(id).catch(() => {});

      if (state.activeChatId === id) {
        revokeImages(state.composerImages);

        set({
          chats: state.chats.filter((chat) => chat.id !== id),
          activeChatId: null,
          pendingRoutePush: null,
          items: [],
          historyLoading: false,
          chatNotFound: false,
          streaming: false,
          streamingTurnId: "",
          pendingApprovals: [],
          todos: [],
          composerImages: [],
          queuedMessages: [],
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
