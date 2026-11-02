import { and, eq } from "drizzle-orm";
import type { ChatAttachment, ChatPermissionMode, ChatSession } from "@veykor/shared";
import { db } from "../db/client.js";
import { conversations, chatHistories, projects, sidebarSections } from "../db/schema.js";
import { attachmentAvailable, stageAttachment, sweepStaging } from "./attachments.js";

export interface StoredAttachment {
  id: string;
  turnId: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ChatAttachment["kind"];
  tool?: boolean;
}

export interface ConversationMetadata {
  id: string;
  title: string;
  projectId: string | null;
  sectionId: string | null;
  providerId: string;
  modelId: string;
  nativeSessionId: string;
  permissionMode: ChatPermissionMode;
  attachments: StoredAttachment[];
  turnTimings?: Record<string, { startedAt: number; seconds: number }>;
}

export function readConversation(
  userId: number,
  id: string,
): ConversationMetadata | undefined {
  const row = db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .get();
  return row
    ? ({ turnTimings: {}, ...JSON.parse(row.data) } as ConversationMetadata)
    : undefined;
}

export function writeConversation(
  userId: number,
  metadata: ConversationMetadata,
) {
  db.insert(conversations)
    .values({ id: metadata.id, userId, data: JSON.stringify(metadata) })
    .onConflictDoUpdate({
      target: conversations.id,
      set: { data: JSON.stringify(metadata) },
      setWhere: eq(conversations.userId, userId),
    })
    .run();
}

export function listConversations(userId: number): ConversationMetadata[] {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .all()
    .map(
      (row) =>
        ({ turnTimings: {}, ...JSON.parse(row.data) }) as ConversationMetadata,
    );
}

export function metadataSession(metadata: ConversationMetadata): ChatSession {
  return {
    id: metadata.id,
    title: metadata.title,
    projectId: metadata.projectId,
    sectionId: metadata.sectionId,
    providerId: metadata.providerId,
    modelId: metadata.modelId,
    nativeSessionId: metadata.nativeSessionId,
    permissionMode: metadata.permissionMode,
    status: "idle",
    error: "",
    approvals: [],
    activities: [],
    messages: [],
  };
}

function decodeDataUrl(dataUrl: string): Buffer | undefined {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl || "");

  if (!match) {
    return undefined;
  }

  try {
    return match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3]));
  } catch {
    return undefined;
  }
}

async function ensureStaged(attachment: ChatAttachment): Promise<void> {
  const bytes = decodeDataUrl(attachment.dataUrl);

  if (!bytes || (await attachmentAvailable(attachment.id))) {
    return;
  }

  try {
    await stageAttachment(attachment.id, bytes);
  } catch (error) {
    console.warn(
      `Staging ${attachment.id} failed: ${error instanceof Error ? error.message : error}`,
    );
  }
}

async function slimSession(
  session: ChatSession,
): Promise<ConversationMetadata> {
  const attachments: StoredAttachment[] = [];

  for (const message of session.messages || []) {
    for (const attachment of message.attachments || []) {
      await ensureStaged(attachment);

      attachments.push({
        id: attachment.id,
        turnId: "",
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        kind: attachment.kind,
      });
    }
  }

  return {
    id: session.id,
    title: session.title,
    projectId: session.projectId,
    sectionId: session.sectionId,
    providerId: "muse",
    modelId: session.modelId,
    nativeSessionId: session.nativeSessionId || "",
    permissionMode: session.permissionMode || "promptUnmatched",
    attachments,
    turnTimings: {},
  };
}

function deleteConversation(userId: number, id: string) {
  db.delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .run();
}

export async function migrateStoredConversations(): Promise<void> {
  for (const row of db.select().from(conversations).all()) {
    const data = JSON.parse(row.data);
    if (!data.turnTimings && !Array.isArray(data.messages) && !data.legacy) {
      data.turnTimings = {};
      writeConversation(row.userId, data as ConversationMetadata);
    }
    const transcript = Boolean(
      (Array.isArray(data.messages) && data.messages.length > 0) || data.legacy,
    );

    if (!data.nativeSessionId && transcript) {
      deleteConversation(row.userId, row.id);
      continue;
    }

    if (Array.isArray(data.messages)) {
      writeConversation(row.userId, await slimSession(data as ChatSession));
    } else if (data.legacy) {
      const { legacy: _legacy, ...metadata } = data;
      writeConversation(row.userId, metadata as ConversationMetadata);
    }
  }

  for (const row of db.select().from(chatHistories).all()) {
    db.delete(chatHistories).where(eq(chatHistories.userId, row.userId)).run();
  }

  const keep = new Set<string>();

  for (const row of db.select().from(conversations).all()) {
    const metadata = JSON.parse(row.data) as ConversationMetadata;

    for (const attachment of metadata.attachments || []) {
      keep.add(attachment.id);
    }
  }

  await sweepStaging(keep);
}

export function projectFolder(
  userId: number,
  projectId: string | null,
): string {
  if (!projectId) {
    return "";
  }
  const project = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
  if (!project) {
    throw new Error("Project not found");
  }
  return project.folder;
}

export function validConversationLocation(
  userId: number,
  session: { projectId: string | null; sectionId: string | null },
): boolean {
  if (session.projectId) {
    return !!db
      .select()
      .from(projects)
      .where(
        and(eq(projects.id, session.projectId), eq(projects.userId, userId)),
      )
      .get();
  }
  return (
    !!session.sectionId &&
    !!db
      .select()
      .from(sidebarSections)
      .where(
        and(
          eq(sidebarSections.id, session.sectionId),
          eq(sidebarSections.userId, userId),
        ),
      )
      .get()
  );
}
