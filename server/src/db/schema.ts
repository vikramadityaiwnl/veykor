import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  photo: text("photo"),
  theme: text("theme").notNull().default("dark"),
  chatDefaults: text("chat_defaults").notNull().default("{}"),
  transcriptionDefaults: text("transcription_defaults").notNull().default("{}"),
  transcriptionApiKey: text("transcription_api_key").notNull().default(""),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});

export const loginLimits = sqliteTable("login_limits", {
  id: integer("id").primaryKey(),
  attempts: integer("attempts").notNull(),
  resetAt: integer("reset_at").notNull(),
});

export const sidebarSections = sqliteTable("sidebar_sections", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull().default(""),
  kind: text("kind").notNull().default("custom"),
  position: integer("position").notNull().default(0),
  isExpanded: integer("is_expanded").notNull().default(1),
  isFixed: integer("is_fixed").notNull().default(0),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull().default(""),
  folder: text("folder").notNull().default(""),
  position: integer("position").notNull().default(0),
  sectionId: text("section_id"),
});

export const chatHistories = sqliteTable("chat_histories", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id),
  sessions: text("sessions").notNull().default("[]"),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  data: text("data").notNull().default("{}"),
  queuePaused: integer("queue_paused").notNull().default(0),
});

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull().default(""),
  transport: text("transport").notNull().default("stdio"),
  command: text("command").notNull().default(""),
  args: text("args").notNull().default("[]"),
  env: text("env").notNull().default("{}"),
  url: text("url").notNull().default(""),
  headers: text("headers").notNull().default("{}"),
  enabled: integer("enabled").notNull().default(1),
  status: text("status").notNull().default("unknown"),
  lastError: text("last_error").notNull().default(""),
  toolCount: integer("tool_count").notNull().default(0),
  lastChecked: integer("last_checked").notNull().default(0),
  createdAt: integer("created_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  providerId: text("provider_id").notNull().default("muse"),
  modelId: text("model_id").notNull().default(""),
  reasoningEffort: text("reasoning_effort").notNull().default(""),
  permissionMode: text("permission_mode").notNull().default("promptUnmatched"),
  projectIds: text("project_ids").notNull().default("[]"),
  toolsMode: text("tools_mode").notNull().default("unrestricted"),
  allowedTools: text("allowed_tools").notNull().default("[]"),
  skillsMode: text("skills_mode").notNull().default("unrestricted"),
  skillIds: text("skill_ids").notNull().default("[]"),
  mcpMode: text("mcp_mode").notNull().default("unrestricted"),
  mcpServerIds: text("mcp_server_ids").notNull().default("[]"),
  createdAt: integer("created_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const collabParticipants = sqliteTable(
  "collab_participants",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .default(0)
      .references(() => users.id),
    parentConversationId: text("parent_conversation_id").notNull().default(""),
    conversationId: text("conversation_id").notNull().default(""),
    agentId: text("agent_id").notNull().default(""),
    agentName: text("agent_name").notNull().default(""),
    role: text("role").notNull().default("delegate"),
    status: text("status").notNull().default("active"),
    joinedAt: integer("joined_at").notNull().default(0),
    lastDeliveredSeq: integer("last_delivered_seq").notNull().default(0),
  },
  (table) => [
    uniqueIndex("collab_participants_session").on(
      table.userId,
      table.parentConversationId,
      table.conversationId,
    ),
    uniqueIndex("collab_participants_agent").on(
      table.userId,
      table.parentConversationId,
      table.agentId,
    ),
    index("collab_participants_parent").on(
      table.userId,
      table.parentConversationId,
    ),
  ],
);

export const collabTasks = sqliteTable(
  "collab_tasks",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .default(0)
      .references(() => users.id),
    parentConversationId: text("parent_conversation_id").notNull().default(""),
    participantId: text("participant_id").notNull().default(""),
    conversationId: text("conversation_id").notNull().default(""),
    agentId: text("agent_id").notNull().default(""),
    agentName: text("agent_name").notNull().default(""),
    title: text("title").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    expectedOutcome: text("expected_outcome").notNull().default(""),
    context: text("context").notNull().default(""),
    state: text("state").notNull().default("queued"),
    waitingOn: text("waiting_on").notNull().default("[]"),
    blockedBy: text("blocked_by").notNull().default(""),
    interruptState: text("interrupt_state").notNull().default("none"),
    interruptReason: text("interrupt_reason").notNull().default(""),
    result: text("result").notNull().default(""),
    resultPreview: text("result_preview").notNull().default(""),
    resultIncomplete: integer("result_incomplete").notNull().default(0),
    error: text("error").notNull().default(""),
    turnId: text("turn_id").notNull().default(""),
    submissionId: text("submission_id").notNull().default(""),
    reminders: integer("reminders").notNull().default(0),
    createdByConversationId: text("created_by_conversation_id")
      .notNull()
      .default(""),
    createdAt: integer("created_at").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(0),
  },
  (table) => [
    index("collab_tasks_parent").on(table.userId, table.parentConversationId),
    index("collab_tasks_session").on(table.userId, table.conversationId),
  ],
);

export const collabEvents = sqliteTable(
  "collab_events",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .default(0)
      .references(() => users.id),
    parentConversationId: text("parent_conversation_id").notNull().default(""),
    seq: integer("seq").notNull().default(0),
    type: text("type").notNull().default("message"),
    sourceKind: text("source_kind").notNull().default("system"),
    sourceConversationId: text("source_conversation_id").notNull().default(""),
    sourceName: text("source_name").notNull().default(""),
    participantId: text("participant_id").notNull().default(""),
    participantName: text("participant_name").notNull().default(""),
    taskId: text("task_id").notNull().default(""),
    correlationId: text("correlation_id").notNull().default(""),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    taskState: text("task_state").notNull().default(""),
    responseRequired: integer("response_required").notNull().default(0),
    createdAt: integer("created_at").notNull().default(0),
  },
  (table) => [
    uniqueIndex("collab_events_seq").on(
      table.userId,
      table.parentConversationId,
      table.seq,
    ),
    uniqueIndex("collab_events_dedupe").on(
      table.userId,
      table.parentConversationId,
      table.correlationId,
      table.type,
    ),
    index("collab_events_parent").on(table.userId, table.parentConversationId),
  ],
);

export const collabDeliveries = sqliteTable(
  "collab_deliveries",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .default(0)
      .references(() => users.id),
    eventId: text("event_id").notNull().default(""),
    parentConversationId: text("parent_conversation_id").notNull().default(""),
    conversationId: text("conversation_id").notNull().default(""),
    state: text("state").notNull().default("queued"),
    updatedAt: integer("updated_at").notNull().default(0),
  },
  (table) => [
    uniqueIndex("collab_deliveries_target").on(
      table.userId,
      table.eventId,
      table.conversationId,
    ),
    index("collab_deliveries_session").on(
      table.userId,
      table.conversationId,
      table.state,
    ),
  ],
);

export const collabMessages = sqliteTable(
  "collab_messages",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .default(0)
      .references(() => users.id),
    parentConversationId: text("parent_conversation_id").notNull().default(""),
    fromConversationId: text("from_conversation_id").notNull().default(""),
    fromName: text("from_name").notNull().default(""),
    toConversationId: text("to_conversation_id").notNull().default(""),
    toName: text("to_name").notNull().default(""),
    taskId: text("task_id").notNull().default(""),
    kind: text("kind").notNull().default("note"),
    text: text("text").notNull().default(""),
    correlationId: text("correlation_id").notNull().default(""),
    createdAt: integer("created_at").notNull().default(0),
  },
  (table) => [
    index("collab_messages_parent").on(
      table.userId,
      table.parentConversationId,
    ),
    index("collab_messages_task").on(table.userId, table.taskId),
  ],
);

export const chatInputs = sqliteTable(
  "chat_inputs",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .default(0)
      .references(() => users.id),
    conversationId: text("conversation_id")
      .notNull()
      .default("")
      .references(() => conversations.id, { onDelete: "cascade" }),
    clientMessageId: text("client_message_id").notNull().default(""),
    payload: text("payload").notNull().default("{}"),
    state: text("state").notNull().default("queued"),
    error: text("error").notNull().default(""),
    errorKind: text("error_kind").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at").notNull().default(0),
  },
  (table) => [
    uniqueIndex("chat_inputs_submission").on(
      table.userId,
      table.conversationId,
      table.clientMessageId,
    ),
    index("chat_inputs_queue").on(
      table.state,
      table.conversationId,
      table.position,
    ),
  ],
);
