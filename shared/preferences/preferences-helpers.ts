import type { ChatPermission } from "../chats/chat-contracts.js";
import type {
  CustomChat,
  InterruptionBehavior,
  PreferredModel,
  SidebarSection,
  SidebarTab,
  UserPreferences,
} from "./preferences-contracts.js";

export const preferencesPaths = {
  preferences: "/api/preferences",
} as const;

const maxSections = 50;

const maxTitleLength = 100;

const maxIdLength = 128;

const maxMappings = 500;

export const recentSectionId = "recent";

export const defaultProjectSectionId = "default-projects";

export function defaultPreferences(): UserPreferences {
  return {
    lastTab: "chat",
    sections: [{ id: recentSectionId, title: "Recent", open: true }],
    workSections: [
      { id: defaultProjectSectionId, title: "Default projects", open: true },
    ],
    projectAgents: {},
    projectExpanded: {},
    chatSections: {},
    chatTitles: {},
    customChats: [],
    removedChatIds: [],
    preferredModels: { chat: null, work: null },
    preferredEfforts: { chat: {}, work: {} },
    preferredPermission: "read-only",
    interruptionBehavior: "queue",
  };
}

export const interruptionBehaviors: Array<{
  value: InterruptionBehavior;
  title: string;
  description: string;
}> = [
  {
    value: "queue",
    title: "Queue",
    description: "New messages wait in a queue until the agent is done.",
  },
  {
    value: "steer",
    title: "Steer",
    description: "New messages steer the running turn right away.",
  },
];

export function interruptionBehaviorTitle(
  behavior: InterruptionBehavior,
): string {
  return (
    interruptionBehaviors.find((entry) => entry.value === behavior)?.title ??
    "Queue"
  );
}

function sanitizePreferredModel(value: unknown): PreferredModel | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as { modelId?: unknown; providerId?: unknown };

  if (typeof record.modelId !== "string" || record.modelId.trim() === "") {
    return null;
  }

  return {
    modelId: record.modelId.trim().slice(0, maxIdLength),
    providerId:
      typeof record.providerId === "string"
        ? record.providerId.trim().slice(0, maxIdLength)
        : "",
  };
}

function sanitizeEffortMap(value: unknown): Record<string, string> {
  const efforts: Record<string, string> = {};

  if (typeof value !== "object" || value === null) {
    return efforts;
  }

  const entries = Object.entries(value).slice(0, maxMappings);

  for (const [modelKey, effort] of entries) {
    const key = sanitizeId(modelKey);
    const tier =
      typeof effort === "string" ? effort.trim().slice(0, maxTitleLength) : "";

    if (key !== "" && tier !== "") {
      efforts[key] = tier;
    }
  }

  return efforts;
}

function sanitizePermission(value: unknown): ChatPermission {
  if (
    value === "read-only" ||
    value === "approved" ||
    value === "full-access"
  ) {
    return value;
  }

  return "read-only";
}

function sanitizeInterruptionBehavior(value: unknown): InterruptionBehavior {
  if (value === "queue" || value === "steer") {
    return value;
  }

  return "queue";
}

function sanitizeId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxIdLength);
}

function sanitizeSection(value: unknown): SidebarSection | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as { id?: unknown; title?: unknown; open?: unknown };
  const id = sanitizeId(record.id);

  if (id === "") {
    return undefined;
  }

  const rawTitle = typeof record.title === "string" ? record.title.trim() : "";
  const title = rawTitle.slice(0, maxTitleLength);

  return {
    id,
    title: title === "" ? "Untitled section" : title,
    open: record.open === true,
  };
}

export function sanitizePreferences(input: unknown): UserPreferences {
  if (typeof input !== "object" || input === null) {
    return defaultPreferences();
  }

  const record = input as {
    lastTab?: unknown;
    sections?: unknown;
    workSections?: unknown;
    projectAgents?: unknown;
    projectExpanded?: unknown;
    chatSections?: unknown;
    chatTitles?: unknown;
    customChats?: unknown;
    removedChatIds?: unknown;
    preferredModels?: unknown;
    preferredEfforts?: unknown;
    preferredPermission?: unknown;
    interruptionBehavior?: unknown;
  };

  const lastTab: SidebarTab = record.lastTab === "work" ? "work" : "chat";

  const sections: Array<SidebarSection> = [];

  if (Array.isArray(record.sections)) {
    for (const entry of record.sections.slice(0, maxSections)) {
      const section = sanitizeSection(entry);

      if (
        section !== undefined &&
        section.id !== "chats" &&
        !sections.some((existing) => existing.id === section.id)
      ) {
        sections.push(section);
      }
    }
  }

  if (!sections.some((section) => section.id === recentSectionId)) {
    sections.unshift({ id: recentSectionId, title: "Recent", open: true });
  }

  const workSections: Array<SidebarSection> = [];

  if (Array.isArray(record.workSections)) {
    for (const entry of record.workSections.slice(0, maxSections)) {
      const section = sanitizeSection(entry);

      if (
        section &&
        section.id !== recentSectionId &&
        section.id !== "chats" &&
        !workSections.some((existing) => existing.id === section.id)
      ) {
        workSections.push(section);
      }
    }
  }

  if (!workSections.some((section) => section.id === defaultProjectSectionId)) {
    workSections.unshift({
      id: defaultProjectSectionId,
      title: "Default projects",
      open: true,
    });
  }

  const projectAgents: Record<string, string> = {};
  const projectExpanded: Record<string, boolean> = {};

  if (
    typeof record.projectAgents === "object" &&
    record.projectAgents !== null
  ) {
    for (const [id, agent] of Object.entries(record.projectAgents).slice(
      0,
      maxMappings,
    )) {
      const projectId = sanitizeId(id);
      const agentId = sanitizeId(agent);

      if (projectId && agentId) {
        projectAgents[projectId] = agentId;
      }
    }
  }

  if (
    typeof record.projectExpanded === "object" &&
    record.projectExpanded !== null
  ) {
    for (const [id, expanded] of Object.entries(record.projectExpanded).slice(
      0,
      maxMappings,
    )) {
      const projectId = sanitizeId(id);

      if (projectId && typeof expanded === "boolean") {
        projectExpanded[projectId] = expanded;
      }
    }
  }

  const chatSections: Record<string, string> = {};

  if (typeof record.chatSections === "object" && record.chatSections !== null) {
    const entries = Object.entries(record.chatSections).slice(0, maxMappings);

    for (const [chatId, sectionId] of entries) {
      const cleanChat = sanitizeId(chatId);
      const cleanSection = sanitizeId(sectionId);

      if (cleanChat !== "" && cleanSection !== "") {
        chatSections[cleanChat] =
          cleanSection === "chats" ? recentSectionId : cleanSection;
      }
    }
  }

  const chatTitles: Record<string, string> = {};

  if (typeof record.chatTitles === "object" && record.chatTitles !== null) {
    const entries = Object.entries(record.chatTitles).slice(0, maxMappings);

    for (const [chatId, title] of entries) {
      const cleanChat = sanitizeId(chatId);
      const cleanTitle =
        typeof title === "string" ? title.trim().slice(0, maxTitleLength) : "";

      if (cleanChat !== "" && cleanTitle !== "") {
        chatTitles[cleanChat] = cleanTitle;
      }
    }
  }

  const customChats: Array<CustomChat> = [];

  if (Array.isArray(record.customChats)) {
    for (const entry of record.customChats.slice(0, maxMappings)) {
      if (typeof entry !== "object" || entry === null) {
        continue;
      }

      const chat = entry as { id?: unknown; title?: unknown };
      const id = sanitizeId(chat.id);

      if (id === "" || customChats.some((existing) => existing.id === id)) {
        continue;
      }

      const rawTitle = typeof chat.title === "string" ? chat.title.trim() : "";
      const title = rawTitle.slice(0, maxTitleLength);

      customChats.push({
        id,
        title: title === "" ? "Untitled chat" : title,
      });
    }
  }

  const removedChatIds: Array<string> = [];

  if (Array.isArray(record.removedChatIds)) {
    for (const entry of record.removedChatIds.slice(0, maxMappings)) {
      const id = sanitizeId(entry);

      if (id !== "" && !removedChatIds.includes(id)) {
        removedChatIds.push(id);
      }
    }
  }

  const preferredModelsInput =
    typeof record.preferredModels === "object" &&
    record.preferredModels !== null
      ? (record.preferredModels as { chat?: unknown; work?: unknown })
      : {};

  const preferredEffortsInput =
    typeof record.preferredEfforts === "object" &&
    record.preferredEfforts !== null
      ? (record.preferredEfforts as { chat?: unknown; work?: unknown })
      : {};

  return {
    lastTab,
    sections,
    workSections,
    projectAgents,
    projectExpanded,
    chatSections,
    chatTitles,
    customChats,
    removedChatIds,
    preferredModels: {
      chat: sanitizePreferredModel(preferredModelsInput.chat),
      work: sanitizePreferredModel(preferredModelsInput.work),
    },
    preferredEfforts: {
      chat: sanitizeEffortMap(preferredEffortsInput.chat),
      work: sanitizeEffortMap(preferredEffortsInput.work),
    },
    preferredPermission: sanitizePermission(record.preferredPermission),
    interruptionBehavior: sanitizeInterruptionBehavior(
      record.interruptionBehavior,
    ),
  };
}
