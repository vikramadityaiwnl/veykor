import { useWorkStore } from "../work/work-store.ts";
import { create } from "zustand";
import { defaultChatTitle, preferredEffortKey } from "@veykor/shared";
import type {
  AnswerInput,
  ChatDetail,
  ChatApprovalRequest,
  ChatHistoryItem,
  ChatModelCatalog,
  ChatPermission,
  ChatSummary,
  DecideApprovalRequest,
  MemoryReceipt,
  QuestionRequest,
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
import { answerQuestions, cancelQuestions } from "./question-client.ts";
import {
  clearQuestionDraft,
  readDismissedQuestions,
  writeDismissedQuestions,
} from "./question-drafts.ts";
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
  finishedChatIds: Array<string>;
  activeChatId: string | null;
  pendingRoutePush: string | null;
  clearRoutePush: () => void;
  pendingSectionId: string;
  items: Array<ChatHistoryItem>;
  historyLoading: boolean;
  chatNotFound: boolean;
  streaming: boolean;
  streamingTurnId: string;
  streamingStartedAt: number;
  error: string;
  pendingApprovals: Array<ChatApprovalRequest>;
  pendingQuestions: Array<QuestionRequest>;
  recentQuestions: Array<QuestionRequest>;
  dismissedQuestions: Array<string>;
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
  queuePaused: boolean;
  composerRestore: ComposerRestore;
  catalog: ChatModelCatalog | null;
  catalogLoading: boolean;
  memoryReceipts: Array<MemoryReceipt>;
  dismissMemoryReceipt: (memoryId: string) => void;
  loadChats: () => Promise<void>;
  startDraft: (sectionId: string) => void;
  syncDraftPreferences: () => void;
  syncChat: (detail: ChatDetail) => void;
  openChat: (id: string, expectedProjectId?: string) => Promise<void>;
  hydrateAttachments: (chatId: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  flushQueuedMessage: (chatId: string) => Promise<void>;
  steerQueuedMessage: (id: string) => Promise<void>;
  editQueuedMessage: (id: string) => void;
  removeQueuedMessage: (id: string) => void;
  cancelTurn: () => Promise<void>;
  decideApproval: (
    approvalId: string,
    choiceId: string,
    feedback?: string,
  ) => Promise<void>;
  answerQuestion: (
    requestId: string,
    answers: Array<AnswerInput>,
  ) => Promise<void>;
  cancelQuestion: (requestId: string) => Promise<void>;
  dismissOrphaned: (requestId: string) => void;
  loadCatalog: (chatId?: string) => Promise<void>;
  setModel: (modelId: string, providerId: string) => void;
  setReasoningEffort: (effort: string) => void;
  setPermission: (permission: ChatPermission) => void;
  addImages: (files: FileList | Array<File>) => void;
  removeImage: (id: string) => void;
  renameChat: (id: string, title: string) => Promise<void>;
  moveChat: (id: string, sectionId: string) => Promise<void>;
  reorderChat: (draggedId: string, targetId: string, before: boolean) => void;
  reorderQueuedMessage: (
    draggedId: string,
    targetId: string,
    before: boolean,
  ) => void;
  deleteChat: (id: string) => Promise<void>;
  clearError: () => void;
}

let chatsLoading = false;

const localTurns = new Map<string, string>();

let openingChatId: string | null = null;

let optimisticItemId: string | null = null;

const finishedChatsKey = "veykor:finished-chats";

function readFinishedChatIds(): Array<string> {
  try {
    const raw = window.localStorage.getItem(finishedChatsKey);

    if (raw === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function writeFinishedChatIds(ids: Array<string>): void {
  try {
    window.localStorage.setItem(finishedChatsKey, JSON.stringify(ids));
  } catch {
    // Best effort; the dots reset on reload.
  }
}

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

function reorderEntries<T extends { id: string }>(
  entries: Array<T>,
  draggedId: string,
  targetId: string,
  before: boolean,
): Array<T> {
  if (draggedId === targetId) {
    return entries;
  }

  const from = entries.findIndex((entry) => entry.id === draggedId);
  const to = entries.findIndex((entry) => entry.id === targetId);

  if (from === -1 || to === -1) {
    return entries;
  }

  const next = [...entries];
  const moved = next.splice(from, 1)[0];

  if (moved === undefined) {
    return entries;
  }

  let insertAt = next.findIndex((entry) => entry.id === targetId);

  if (!before) {
    insertAt += 1;
  }

  next.splice(insertAt, 0, moved);

  return next;
}

function titleFromText(text: string): string {
  const firstLine = text.split("\n")[0].trim().replace(/\s+/g, " ");

  if (firstLine === "") {
    return defaultChatTitle();
  }

  return firstLine.slice(0, 60);
}

function moveToSectionTop(
  chats: Array<ChatSummary>,
  chatId: string,
  running: boolean,
): Array<ChatSummary> {
  const index = chats.findIndex((chat) => chat.id === chatId);
  const target = chats[index];

  if (index === -1 || target === undefined) {
    return chats;
  }

  const rest = chats.filter((chat) => chat.id !== chatId);
  const moved = { ...target, running };
  const firstOfSection = rest.findIndex(
    (chat) => chat.sectionId === target.sectionId,
  );

  const next = [...rest];

  next.splice(
    firstOfSection === -1 ? Math.min(index, next.length) : firstOfSection,
    0,
    moved,
  );

  return next;
}

function markFinished(
  finishedChatIds: Array<string>,
  chatId: string,
  activeChatId: string | null,
): Array<string> {
  if (chatId === activeChatId) {
    return finishedChatIds.filter((id) => id !== chatId);
  }

  if (finishedChatIds.includes(chatId)) {
    return finishedChatIds;
  }

  return [...finishedChatIds, chatId];
}

function settleItem(
  items: Array<ChatHistoryItem>,
  next: ChatHistoryItem,
): Array<ChatHistoryItem> {
  const pendingId = optimisticItemId;

  if (
    next.kind === "userMessage" &&
    pendingId !== null &&
    items.some((item) => item.itemId === pendingId)
  ) {
    optimisticItemId = null;

    return items.map((item) => (item.itemId === pendingId ? next : item));
  }

  return upsertItem(items, next);
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
  finishedChatIds: readFinishedChatIds(),
  activeChatId: null,
  pendingRoutePush: null,
  pendingSectionId: "recent",
  items: [],
  historyLoading: false,
  chatNotFound: false,
  streaming: false,
  streamingTurnId: "",
  streamingStartedAt: 0,
  error: "",
  pendingApprovals: [],
  pendingQuestions: [],
  recentQuestions: [],
  dismissedQuestions: readDismissedQuestions(),
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
  queuePaused: false,
  composerRestore: { seq: 0, text: "" },
  catalog: null,
  catalogLoading: false,
  memoryReceipts: [],

  dismissMemoryReceipt: (memoryId) => {
    set((current) => ({
      memoryReceipts: current.memoryReceipts.filter(
        (receipt) => receipt.memoryId !== memoryId,
      ),
    }));
  },

  loadChats: async () => {
    if (chatsLoading) {
      return;
    }

    chatsLoading = true;

    try {
      const chats = await fetchChats();

      set((current) => {
        if (current.chats.length === 0) {
          return { chats, chatsLoaded: true };
        }

        const fetched = new Map(chats.map((chat) => [chat.id, chat]));
        const kept: Array<ChatSummary> = [];
        const justFinished: Array<string> = [];
        let finishedChatIds = current.finishedChatIds;

        for (const existing of current.chats) {
          const updated = fetched.get(existing.id);

          if (updated === undefined) {
            continue;
          }

          if (existing.id === current.activeChatId) {
            kept.push({ ...updated, running: existing.running });
          } else {
            if (existing.running && !updated.running) {
              finishedChatIds = markFinished(
                finishedChatIds,
                existing.id,
                current.activeChatId,
              );
              justFinished.push(existing.id);
            }

            kept.push(updated);
          }

          fetched.delete(existing.id);
        }

        let ordered = [...fetched.values(), ...kept];
        const alive = new Set(ordered.map((chat) => chat.id));

        for (const id of justFinished) {
          ordered = moveToSectionTop(ordered, id, false);
        }

        return {
          chats: ordered,
          chatsLoaded: true,
          finishedChatIds: finishedChatIds.filter((id) => alive.has(id)),
        };
      });
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
    optimisticItemId = null;

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
      streamingStartedAt: 0,
      error: "",
      pendingApprovals: [],
      pendingQuestions: [],
      recentQuestions: [],
      todos: [],
      composerImages: [],
      queuedMessages: [],
      queuePaused: false,
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

  syncChat: (detail) => {
    const current = get();

    if (current.activeChatId !== detail.chat.id) {
      return;
    }

    if (detail.chat.projectId !== useWorkStore.getState().projectId) {
      return;
    }

    const stillPending = new Set(
      detail.pendingQuestions.map((request) => request.id),
    );

    for (const previous of current.pendingQuestions) {
      if (!stillPending.has(previous.id)) {
        clearQuestionDraft(previous.id);
      }
    }

    const completedLocalTurn =
      current.streaming &&
      !detail.running &&
      current.streamingTurnId !== "" &&
      Object.hasOwn(detail.turnDurations, current.streamingTurnId) &&
      detail.items.some(
        (item) =>
          item.turnId === current.streamingTurnId &&
          item.kind === "agentMessage" &&
          item.status === "completed",
      );

    if (localTurns.has(detail.chat.id) && !completedLocalTurn) {
      set({
        pendingQuestions: detail.pendingQuestions,
        recentQuestions: detail.recentQuestions,
      });

      return;
    }

    clearApprovalTimers();
    set((state) => {
      const previous = state.chats.find((chat) => chat.id === detail.chat.id);
      const finished =
        previous?.running === true && detail.chat.running === false;

      const chats =
        previous === undefined
          ? [detail.chat, ...state.chats]
          : state.chats.map((chat) =>
              chat.id === detail.chat.id ? detail.chat : chat,
            );

      return {
        items: detail.items,
        turnDurations: detail.turnDurations,
        pendingApprovals: detail.pendingApprovals,
        pendingQuestions: detail.pendingQuestions,
        recentQuestions: detail.recentQuestions,
        streaming: detail.running,
        streamingTurnId: detail.activeTurnId,
        streamingStartedAt: detail.activeTurnStartedAt,
        modelId: detail.modelId,
        providerId: detail.providerId,
        reasoningEffort: detail.reasoningEffort,
        permission: detail.permission,
        historyLoading: false,
        chatNotFound: false,
        chats: finished
          ? moveToSectionTop(chats, detail.chat.id, false)
          : chats,
        finishedChatIds: finished
          ? markFinished(
              state.finishedChatIds,
              detail.chat.id,
              state.activeChatId,
            )
          : state.finishedChatIds,
      };
    });

    if (!detail.running) {
      void get().flushQueuedMessage(detail.chat.id);
    }
  },

  openChat: async (id, expectedProjectId = "") => {
    if (openingChatId === id && get().activeChatId === id) {
      return;
    }

    openingChatId = id;
    clearApprovalTimers();
    optimisticItemId = null;

    set((current) => ({
      activeChatId: id,
      pendingRoutePush: null,
      streaming: false,
      streamingTurnId: "",
      streamingStartedAt: 0,
      historyLoading: true,
      chatNotFound: false,
      items: [],
      pendingApprovals: [],
      pendingQuestions: [],
      recentQuestions: [],
      todos: [],
      error: "",
      queuedMessages: [],
      queuePaused: false,
      composerRestore: { seq: 0, text: "" },
      finishedChatIds: current.finishedChatIds.filter(
        (finishedId) => finishedId !== id,
      ),
    }));

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

          if (detail.chat.projectId !== expectedProjectId) {
            set({
              historyLoading: false,
              chatNotFound: true,
              error: "",
              items: [],
              pendingApprovals: [],
              pendingQuestions: [],
              recentQuestions: [],
              todos: [],
            });

            return;
          }

          const patch: Partial<ChatState> = {
            streaming: detail.running,
            streamingTurnId: detail.activeTurnId,
            streamingStartedAt: detail.activeTurnStartedAt,
            items: detail.items,
            turnDurations: detail.turnDurations,
            pendingApprovals: detail.pendingApprovals,
            pendingQuestions: detail.pendingQuestions,
            recentQuestions: detail.recentQuestions,
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

          set((current) => ({
            chats: current.chats.map((chat) =>
              chat.id === id ? { ...chat, running: detail.running } : chat,
            ),
          }));

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

    const work = useWorkStore.getState();

    if (
      work.projectId !== "" &&
      work.loaded &&
      work.projects.every((project) => project.id !== work.projectId)
    ) {
      set({ error: "That project no longer exists. Choose another project." });

      return;
    }

    const active =
      get().activeChatId === null
        ? undefined
        : get().chats.find((chat) => chat.id === get().activeChatId);

    if (active && active.projectId !== work.projectId) {
      set({
        error: "That session belongs to another project. Reopen it there.",
      });

      return;
    }

    const startedAt = Date.now();

    const payload: Array<TurnImageInput> = images.map((image) => ({
      mediaType: image.mediaType,
      base64Data: image.base64Data,
    }));
    const submissionId = `local-${crypto.randomUUID()}`;
    optimisticItemId = submissionId;

    const optimisticItem: ChatHistoryItem = {
      itemId: optimisticItemId,
      kind: "userMessage",
      status: "completed",
      turnId: null,
      text: trimmed,
      summary: [],
      tool: "",
      displayLabel: "",
      visibleOutput: "",
      args: "",
      recordedAt: new Date().toISOString(),
      attachments: payload.map((image) => ({
        mediaType: image.mediaType,
      })),
    };

    set({
      streaming: true,
      queuePaused: false,
      streamingTurnId: "",
      streamingStartedAt: startedAt,
      items: [...state.items, optimisticItem],
      error: "",
    });

    set({ composerImages: [] });

    let chatId = get().activeChatId;
    let failed = false;

    try {
      if (chatId === null) {
        const detail = await createChat(
          get().pendingSectionId,
          work.projectId,
          work.agentId,
        );

        chatId = detail.chat.id;
        localTurns.set(chatId, submissionId);

        set((current) => ({
          activeChatId: chatId,
          pendingRoutePush: chatId,
          chats: [detail.chat, ...current.chats],
          items: current.items,
          turnDurations: detail.turnDurations,
          pendingApprovals: detail.pendingApprovals,
          pendingQuestions: detail.pendingQuestions,
          recentQuestions: detail.recentQuestions,
        }));
      }

      localTurns.set(chatId, submissionId);

      const turnChatId = chatId;
      const title = trimmed === "" ? null : titleFromText(trimmed);

      set((current) => ({
        chats: moveToSectionTop(current.chats, turnChatId, true).map((chat) =>
          title !== null &&
          chat.id === turnChatId &&
          (chat.title === defaultChatTitle() || chat.title === "")
            ? { ...chat, title }
            : chat,
        ),
        finishedChatIds: current.finishedChatIds.filter(
          (finishedId) => finishedId !== turnChatId,
        ),
      }));

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
        work.projectId === "" &&
        (settings.modelId !== undefined ||
          settings.reasoningEffort !== undefined ||
          settings.permission !== undefined)
      ) {
        await updateSettings(chatId, settings);
      }

      let currentTurnId = "";

      await streamTurn(chatId, trimmed, payload, (event) => {
        if (
          get().activeChatId !== chatId ||
          localTurns.get(turnChatId) !== submissionId ||
          (currentTurnId !== "" &&
            !get().streaming &&
            Object.hasOwn(get().turnDurations, currentTurnId))
        ) {
          return;
        }

        switch (event.type) {
          case "turn-started":
            if (
              !get().streaming &&
              Object.hasOwn(get().turnDurations, event.turnId)
            ) {
              break;
            }

            currentTurnId = event.turnId;
            set((current) => ({
              streamingTurnId: event.turnId,
              streamingStartedAt:
                event.startedAt && event.startedAt > 0
                  ? event.startedAt
                  : current.streamingStartedAt,
              items:
                optimisticItemId === null
                  ? current.items
                  : current.items.map((item) =>
                      item.itemId === optimisticItemId
                        ? { ...item, turnId: event.turnId }
                        : item,
                    ),
            }));
            break;

          case "item":
            set((currentItems) => {
              const items = settleItem(currentItems.items, event.item);

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
            optimisticItemId = null;

            set((current) => ({
              streaming: false,
              streamingTurnId: "",
              streamingStartedAt: 0,
              turnDurations: {
                ...current.turnDurations,
                [event.turnId]: event.durationMs > 0 ? event.durationMs : 0,
              },
              chats: moveToSectionTop(current.chats, turnChatId, false),
              finishedChatIds: markFinished(
                current.finishedChatIds,
                turnChatId,
                current.activeChatId,
              ),
            }));
            void get().loadChats();
            break;

          case "error":
            break;

          case "memory-saved":
            set((current) => ({
              memoryReceipts: [
                ...current.memoryReceipts.filter(
                  (receipt) => receipt.memoryId !== event.receipt.memoryId,
                ),
                event.receipt,
              ].slice(-3),
            }));
            break;
        }
      });

      if (
        get().activeChatId === chatId &&
        chatId !== null &&
        localTurns.get(chatId) === submissionId
      ) {
        set((current) => ({
          streaming: false,
          streamingTurnId: "",
          chats: current.chats.map((chat) =>
            chat.id === turnChatId ? { ...chat, running: false } : chat,
          ),
        }));
      }
    } catch (cause) {
      failed = true;

      const ownsSubmission =
        chatId === null
          ? get().draftSeq === state.draftSeq
          : localTurns.get(chatId) === submissionId;
      const failedId = submissionId;

      if (optimisticItemId === submissionId) {
        optimisticItemId = null;
      }

      if (get().activeChatId === chatId && ownsSubmission) {
        set((current) => ({
          streaming: false,
          streamingTurnId: "",
          streamingStartedAt: 0,
          error: errorMessage(cause, "Unable to send message."),
          items:
            failedId === null
              ? current.items
              : current.items.filter((item) => item.itemId !== failedId),
          chats: current.chats.map((chat) =>
            chat.id === chatId ? { ...chat, running: false } : chat,
          ),
        }));
      }
    }

    if (chatId !== null && localTurns.get(chatId) === submissionId) {
      localTurns.delete(chatId);
    }

    if (!failed && chatId !== null) {
      await get().flushQueuedMessage(chatId);
    }
  },

  flushQueuedMessage: async (chatId) => {
    const state = get();
    const next = state.queuedMessages[0];

    if (
      !next ||
      state.activeChatId !== chatId ||
      state.streaming ||
      state.historyLoading ||
      state.queuePaused
    ) {
      return;
    }

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

    const cancelledChatId = state.activeChatId;

    set({ queuePaused: true });

    try {
      await cancelTurnRequest(state.activeChatId, state.streamingTurnId);

      set((current) => ({
        streaming: false,
        queuePaused: true,
        streamingTurnId: "",
        error: "",
        chats: current.chats.map((chat) =>
          chat.id === cancelledChatId ? { ...chat, running: false } : chat,
        ),
      }));
    } catch (cause) {
      set({ error: errorMessage(cause, "Unable to cancel turn.") });
    }
  },

  answerQuestion: async (requestId, answers) => {
    const state = get();

    if (state.activeChatId === null) {
      throw new Error("Open a chat first.");
    }

    const { request } = await answerQuestions(
      state.activeChatId,
      requestId,
      answers,
    );

    clearQuestionDraft(requestId);

    set((current) => ({
      pendingQuestions: current.pendingQuestions.filter(
        (entry) => entry.id !== requestId,
      ),
      recentQuestions: request.isMain
        ? [
            request,
            ...current.recentQuestions.filter(
              (entry) => entry.id !== requestId,
            ),
          ].slice(0, 50)
        : current.recentQuestions,
    }));
  },

  cancelQuestion: async (requestId) => {
    const state = get();

    if (state.activeChatId === null) {
      throw new Error("Open a chat first.");
    }

    const { request } = await cancelQuestions(state.activeChatId, requestId);

    clearQuestionDraft(requestId);

    set((current) => ({
      pendingQuestions: current.pendingQuestions.filter(
        (entry) => entry.id !== requestId,
      ),
      recentQuestions: request.isMain
        ? [
            request,
            ...current.recentQuestions.filter(
              (entry) => entry.id !== requestId,
            ),
          ].slice(0, 50)
        : current.recentQuestions,
    }));
  },

  dismissOrphaned: (requestId) => {
    set((current) => {
      if (current.dismissedQuestions.includes(requestId)) {
        return current;
      }

      const dismissedQuestions = [...current.dismissedQuestions, requestId];

      writeDismissedQuestions(dismissedQuestions);

      return { dismissedQuestions };
    });
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

  reorderChat: (draggedId, targetId, before) => {
    set((current) => {
      const dragged = current.chats.find((chat) => chat.id === draggedId);
      const target = current.chats.find((chat) => chat.id === targetId);

      if (
        dragged === undefined ||
        target === undefined ||
        dragged.sectionId !== target.sectionId
      ) {
        return current;
      }

      return {
        chats: reorderEntries(current.chats, draggedId, targetId, before),
      };
    });
  },

  reorderQueuedMessage: (draggedId, targetId, before) => {
    set((current) => ({
      queuedMessages: reorderEntries(
        current.queuedMessages,
        draggedId,
        targetId,
        before,
      ),
    }));
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
          finishedChatIds: state.finishedChatIds.filter(
            (finishedId) => finishedId !== id,
          ),
          activeChatId: null,
          pendingRoutePush: null,
          items: [],
          historyLoading: false,
          chatNotFound: false,
          streaming: false,
          streamingTurnId: "",
          streamingStartedAt: 0,
          pendingApprovals: [],
          todos: [],
          composerImages: [],
          queuedMessages: [],
          queuePaused: false,
          error: "",
        });
      } else {
        set({
          chats: state.chats.filter((chat) => chat.id !== id),
          finishedChatIds: state.finishedChatIds.filter(
            (finishedId) => finishedId !== id,
          ),
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

useChatStore.subscribe((state, previous) => {
  if (state.finishedChatIds !== previous.finishedChatIds) {
    writeFinishedChatIds(state.finishedChatIds);
  }
});
