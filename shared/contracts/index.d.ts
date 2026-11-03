export type { HealthResponse } from "./health/index.js";

export type {
  AuthUser,
  AuthStatus,
  AuthCredentials,
  UpdateProfileInput,
} from "./auth/index.js";

export type { ConfigurationUsersResponse } from "./configuration/index.js";

export type {
  SidebarSectionKind,
  SidebarSection,
  SidebarSectionsResponse,
  CreateSidebarSectionInput,
  UpdateSidebarSectionInput,
} from "./sidebar/index.js";

export type {
  Project,
  ProjectsResponse,
  ProjectContext,
  CreateProjectInput,
  UpdateProjectInput,
  DeleteProjectChatsResponse,
} from "./projects/index.js";

export type {
  ProviderSessionSummary,
  ProviderSessionsResponse,
  ProviderCliId,
  ProviderCliStatus,
  CliStatusResponse,
} from "./providers/index.js";

export type {
  ChatMessageBehavior,
  QueuedChatMessage,
  QueuedMessageErrorKind,
  ChatPermissionMode,
  ChatReasoningEffort,
  ChatReasoningEffortOption,
  ChatApproval,
  ChatActivity,
  ChatAttachment,
  ChatToolCall,
  ChatModel,
  ChatProvider,
  ChatCatalogResponse,
  ChatUsage,
  ChatThoughtEntry,
  ChatMessage,
  ChatSession,
  ChatSessionsResponse,
  ChatRequest,
} from "./chat/index.js";

export type {
  SettingsProvider,
  SettingsResponse,
  GeneralPreferences,
  ChatDefaults,
} from "./settings/index.js";

export type {
  TranscriptionModel,
  TranscriptionProvider,
  TranscriptionCatalogResponse,
  TranscriptionDefaults,
  TranscribeEndFrame,
  TranscribeClientFrame,
  TranscribeServerFrame,
  TranscriptionKeyStatus,
  UpdateTranscriptionKeyInput,
} from "./transcription/index.js";

export type {
  StatusCpu,
  StatusDatabase,
  StatusMemory,
  StatusStorage,
  SystemStatusResponse,
} from "./status/index.js";

export type {
  McpTransport,
  McpServerStatus,
  McpServer,
  McpServersResponse,
  CreateMcpServerInput,
  UpdateMcpServerInput,
  McpTool,
  McpTestResult,
  McpDetectedServer,
  McpDetectedSource,
  McpDetectedResponse,
  McpDetectedAction,
} from "./mcp/index.js";

export type {
  DetectedSkill,
  DetectedSkillSource,
  DetectedSkillsResponse,
  SkillDetail,
  CreateSkillInput,
  UpdateSkillInput,
} from "./skills/index.js";

export type {
  AgentAccessMode,
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
  AgentsResponse,
  ProjectAgent,
  ProjectAgentsResponse,
  AgentSnapshot,
} from "./agents/index.js";

export type {
  CollabTaskState,
  CollabInterruptState,
  CollabEventType,
  CollabMessageKind,
  CollabSourceKind,
  CollabDeliveryState,
  CollabParticipant,
  CollabTask,
  CollabEvent,
  CollabDelivery,
  CollabMessage,
  CollabSnapshot,
  CollabSessionState,
  CollabDetailResponse,
  DelegateTaskInput,
  DelegateTaskResponse,
  SendCollabMessageInput,
  SendCollabMessageResponse,
  ReportCollabResultInput,
  InterruptCollabTaskResponse,
  CollabAttachmentReference,
} from "./collab/index.js";
