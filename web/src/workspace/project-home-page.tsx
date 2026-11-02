import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { ChatAttachment, ChatModel, ChatPermissionMode, ChatReasoningEffort, ProviderCliId } from "@veykor/shared";
import { Center } from "@astryxdesign/core/Center";
import { ChatLayout } from "@astryxdesign/core/Chat";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/VStack";
import { useChatSessionsStore, emptyUsage, type SessionMessage } from "./chat-sessions-store";
import { useChatDefaultsStore } from "./chat-defaults-store";
import { useSidebarSectionsStore } from "./sidebar-sections-store";
import { useAuthStore } from "../auth/auth-store";
import { useSettingsStore } from "../settings/settings-store";
import type { ChatDraft } from "./chat-draft";
import { useChatRuntimeStore, chatAction } from "./chat-runtime-store";
import { ChatNativeActivity } from "./components/chat-native-activity";
import { ChatComposerPanel } from "./components/chat-composer-panel";
import { ConversationMessages } from "./components/conversation-messages";
import { useProjectsStore } from "./projects-store";
import { chatGreeting } from "./chat-greeting";
import { useAgentsStore } from "../agents/agents-store";

const noMessages: SessionMessage[] = [];

const noPreferredModels: Record<string, string> = {};

function resolveEffort(
  model: ChatModel | undefined,
  saved: ChatReasoningEffort | undefined,
  choice: { modelId: string; effort: ChatReasoningEffort } | null,
): ChatReasoningEffort {
  const tiers = (model?.reasoningEfforts || []).map((option) => option.tier);

  if (saved && tiers.includes(saved)) {
    return saved;
  }

  if (choice && choice.modelId === model?.id && tiers.includes(choice.effort)) {
    return choice.effort;
  }

  if (model && tiers.includes(model.defaultReasoningEffort)) {
    return model.defaultReasoningEffort;
  }

  return tiers[0] || "max";
}

export function ProjectHomePage() {
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const location = useLocation();
  const draft = (location.state as { draft?: ChatDraft } | null)?.draft;
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [permissionChoice, setPermissionChoice] =
    useState<ChatPermissionMode | null>(null);
  const [effortChoice, setEffortChoice] = useState<{
    modelId: string;
    effort: ChatReasoningEffort;
  } | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const sessions = useChatSessionsStore((state) => state.sessions);
  const status = useChatSessionsStore((state) => state.status);
  const historyError = useChatSessionsStore((state) => state.error);
  const messages = useChatSessionsStore((state) =>
    sessionId ? state.messages[sessionId] || noMessages : noMessages,
  );
  const projects = useProjectsStore((state) => state.projects);
  const session = sessions.find((entry) => entry.id === sessionId);
  const userId = useAuthStore((state) => state.status?.user?.id ?? null);
  const loadDefaults = useChatDefaultsStore((state) => state.load);
  const defaultProviderPreference = useChatDefaultsStore(
    (state) => state.defaultProviderId,
  );
  const preferredModels = useChatDefaultsStore((state) => state.models);
  const savedEfforts = useChatDefaultsStore((state) => state.efforts);
  const messageBehavior = useChatDefaultsStore(
    (state) => state.messageBehavior,
  );
  const savedPermissionMode = useChatDefaultsStore(
    (state) => state.permissionMode,
  );
  const providers = useSettingsStore((state) => state.providers);
  const loading = useSettingsStore(
    (state) => state.status === "idle" || state.status === "loading",
  );
  const catalogError = useSettingsStore((state) => state.error);
  const runningId = useChatRuntimeStore((state) => state.runningSessionId);
  const runtimeError = useChatRuntimeStore((state) =>
    state.errorSessionId === sessionId ? state.error : "",
  );
  const runtimeErrorKind = useChatRuntimeStore((state) =>
    state.errorSessionId === sessionId ? state.errorKind : "",
  );
  const stop = useChatRuntimeStore((state) => state.stop);
  const sections = useSidebarSectionsStore((state) => state.sections);
  const defaultSection =
    sections.find(
      (section) => section.kind === "chats" && section.id === draft?.sectionId,
    ) ||
    sections.find((section) => section.kind === "chats" && section.isFixed) ||
    sections.find((section) => section.kind === "chats");
  const isProjectChat = !!session?.projectId || !!draft?.projectId;
  const activeProjectId = session?.projectId || draft?.projectId || "";
  const projectAgents = useAgentsStore((state) =>
    activeProjectId ? state.projectAgents[activeProjectId] : undefined,
  );
  const loadForProject = useAgentsStore((state) => state.loadForProject);
  const agentList = projectAgents || [];
  const effectiveAgentId = session?.agentId || selectedAgentId;
  const selectedAgent = agentList.find(
    (agent) => agent.id === effectiveAgentId,
  );
  const permissionPreference =
    permissionChoice ||
    (isProjectChat ? "promptUnmatched" : savedPermissionMode);
  const preferredProviderId =
    session?.providerId ||
    defaultProvider ||
    (!isProjectChat ? defaultProviderPreference : "");
  const isProviderLocked =
    !!session?.nativeSessionId ||
    (session?.queuedMessages || []).length > 0 ||
    messages.some((message) => message.role === "user");
  const provider = isProviderLocked
    ? providers.find((entry) => entry.id === preferredProviderId)
    : providers.find(
        (entry) => entry.available && entry.id === preferredProviderId,
      ) || providers.find((entry) => entry.available);
  const providerId = provider?.id || "";
  const permissionMode =
    providerId === "opencode" && permissionPreference === "onRequest"
      ? "promptUnmatched"
      : permissionPreference;
  const preferredModelId =
    session?.providerId === providerId
      ? session.modelId
      : defaultModel ||
        (!isProjectChat ? preferredModels[providerId] || "" : "");
  const modelId =
    provider?.models.find((entry) => entry.id === preferredModelId)?.id ||
    provider?.models[0]?.id ||
    "";
  const model = provider?.models.find((entry) => entry.id === modelId);
  const reasoningEffort = resolveEffort(
    model,
    session?.reasoningEffort || savedEfforts[modelId],
    effortChoice,
  );
  const agentProvider = selectedAgent
    ? providers.find((entry) => entry.id === selectedAgent.providerId)
    : undefined;
  const agentModel = agentProvider?.models.find(
    (entry) => entry.id === selectedAgent?.modelId,
  );
  const chatProviderId = isProjectChat
    ? selectedAgent?.providerId || session?.providerId || ""
    : providerId;
  const chatModelId = isProjectChat
    ? selectedAgent?.modelId || session?.modelId || ""
    : modelId;
  const chatEffort = isProjectChat
    ? resolveEffort(
        agentModel,
        selectedAgent?.reasoningEffort || session?.reasoningEffort || undefined,
        effortChoice,
      )
    : reasoningEffort;
  const chatPermissionMode = isProjectChat
    ? chatProviderId === "opencode" &&
      (permissionChoice ||
        session?.permissionMode ||
        selectedAgent?.permissionMode ||
        "promptUnmatched") === "onRequest"
      ? "promptUnmatched"
      : permissionChoice ||
        session?.permissionMode ||
        selectedAgent?.permissionMode ||
        "promptUnmatched"
    : permissionMode;
  const agentMissing = isProjectChat && !effectiveAgentId && !isProviderLocked;
  const lastReply = messages
    .filter((message) => message.role === "assistant")
    .at(-1);
  const hasThreadContent =
    messages.length > 0 ||
    (session?.approvals || []).length > 0 ||
    (session?.activities || []).length > 0;
  const missingSession = !!sessionId && status === "ready" && !session;
  const ready =
    status === "ready" &&
    !missingSession &&
    !agentMissing &&
    (!!session || !!draft?.projectId || !!defaultSection);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sessionId && status === "ready") {
      void useChatSessionsStore.getState().openSession(sessionId);
    }
  }, [sessionId, status]);

  useEffect(() => {
    if (userId !== null) {
      void loadDefaults();
    }
  }, [userId, loadDefaults]);

  useEffect(() => {
    if (activeProjectId) {
      void loadForProject(activeProjectId);
    }
  }, [activeProjectId, loadForProject]);

  function select(providerId: string, modelId: string) {
    if (isProviderLocked && session?.providerId !== providerId) {
      return;
    }

    useChatRuntimeStore.setState({
      error: "",
      errorKind: "",
      errorSessionId: "",
    });
    setEffortChoice(null);

    if (session) {
      useChatSessionsStore
        .getState()
        .configure(session.id, providerId, modelId);
    } else {
      setDefaultProvider(providerId);
      setDefaultModel(modelId);
    }

    if (!isProjectChat) {
      void useChatDefaultsStore.getState().save(providerId, modelId);
    }
  }

  function selectAgent(agentId: string) {
    const agent = agentList.find((entry) => entry.id === agentId);

    if (!agent || isProviderLocked) {
      return;
    }

    setSelectedAgentId(agentId);
    setEffortChoice(null);
    useChatRuntimeStore.setState({
      error: "",
      errorKind: "",
      errorSessionId: "",
    });

    if (session) {
      useChatSessionsStore
        .getState()
        .configure(
          session.id,
          agent.providerId,
          agent.modelId,
          agent.reasoningEffort || undefined,
          agent.permissionMode,
          agent.id,
          agent.name,
        );
    }
  }

  async function submit(
    text: string,
    systemPrompt: string,
    attachments: ChatAttachment[],
  ) {
    if (!ready) {
      return false;
    }
    const store = useChatSessionsStore.getState();
    const target =
      session ||
      (draft?.projectId
        ? store.createProjectSession(draft.projectId)
        : store.createChatSession(defaultSection!.id));
    const willWait =
      session?.status === "running" ||
      runningId === target.id ||
      (session?.queuedMessages || []).length > 0;
    if (!willWait) {
      store.addMessage(target.id, text, attachments);
    }
    store.configure(
      target.id,
      chatProviderId,
      chatModelId,
      chatEffort,
      undefined,
      isProjectChat ? effectiveAgentId || null : undefined,
      isProjectChat
        ? selectedAgent?.name || session?.agentName || ""
        : undefined,
    );
    const message = willWait
      ? { id: crypto.randomUUID(), text, attachments }
      : useChatSessionsStore.getState().messages[target.id].at(-1)!;
    navigate(`/chat/${target.id}`);
    return useChatRuntimeStore.getState().send(target.id, {
      delivery: messageBehavior,
      conversationId: target.id,
      messageId: message.id,
      permissionMode: session?.permissionMode || chatPermissionMode,
      reasoningEffort: chatEffort,
      providerId: chatProviderId as ProviderCliId,
      modelId: chatModelId,
      messages: [
        { role: "user", text: message.text, attachments: message.attachments },
      ],
      systemPrompt,
    });
  }

  return (
    <ChatLayout
      className="min-h-0 flex-1"
      emptyState={
        <Center className="px-6 text-center">
          <VStack gap={8} hAlign="center">
            <img
              className="size-[calc(var(--spacing-12)*2)] object-contain opacity-40 dark:invert"
              src="/logo.svg"
              alt=""
            />
            <Heading
              level={1}
              weight="semibold"
              className="max-w-2xl text-center text-xl! sm:text-2xl!"
            >
              {missingSession
                ? "Chat not found"
                : status === "loading"
                  ? "Loading chats…"
                  : chatGreeting(now)}
            </Heading>
          </VStack>
        </Center>
      }
      composer={
        <ChatComposerPanel
          key={sessionId || draft?.id || "home"}
          isProjectChat={isProjectChat}
          agents={agentList}
          agentId={effectiveAgentId}
          agentName={session?.agentName || selectedAgent?.name || ""}
          isAgentLocked={isProviderLocked}
          agentMissing={agentMissing}
          onAgentChange={selectAgent}
          permissionMode={session?.permissionMode || chatPermissionMode}
          onPermissionMode={(mode) => {
            setPermissionChoice(mode);

            if (session) {
              useChatSessionsStore
                .getState()
                .configure(
                  session.id,
                  chatProviderId,
                  chatModelId,
                  undefined,
                  mode,
                );
              void chatAction(session.id, "mode", { mode }).catch((error) =>
                useChatRuntimeStore.setState({
                  error: error.message,
                  errorKind: "rejected",
                  errorSessionId: session.id,
                }),
              );
            }

            if (!isProjectChat) {
              void useChatDefaultsStore.getState().savePermission(mode);
            }
          }}
          reasoningEffort={chatEffort}
          onReasoningEffort={(effort) => {
            setEffortChoice({ modelId: chatModelId, effort });

            if (session) {
              useChatSessionsStore
                .getState()
                .configure(session.id, chatProviderId, chatModelId, effort);
              void chatAction(session.id, "settings", {
                reasoningEffort: effort,
              }).catch((error) =>
                useChatRuntimeStore.setState({
                  error: error.message,
                  errorKind: "rejected",
                  errorSessionId: session.id,
                }),
              );
            }

            if (!isProjectChat && modelId) {
              void useChatDefaultsStore.getState().saveEffort(modelId, effort);
            }
          }}
          isNewProjectChat={!sessionId && !!draft?.projectId}
          project={projects.find(
            (project) =>
              project.id === (session?.projectId || draft?.projectId),
          )}
          providers={providers}
          isProviderLocked={isProviderLocked}
          providerId={chatProviderId}
          modelId={chatModelId}
          preferredModels={isProjectChat ? noPreferredModels : preferredModels}
          loading={loading}
          isReady={ready}
          isRunning={session?.status === "running" || runningId === sessionId}
          sessionId={sessionId || ""}
          queuedMessages={session?.queuedMessages || []}
          queuePaused={session?.queuePaused || false}
          messageBehavior={messageBehavior}
          isBusy={!!runningId}
          error={runtimeError || session?.error || historyError || catalogError}
          errorKind={runtimeError ? runtimeErrorKind : ""}
          usage={lastReply?.usage || emptyUsage()}
          hasMessages={messages.some((message) => message.role === "user")}
          onSelection={select}
          onSubmit={submit}
          onStop={() => stop(sessionId)}
        />
      }
    >
      {hasThreadContent ? (
        <>
          {messages.length > 0 ? (
            <ConversationMessages
              messages={messages}
              isRunning={
                session?.status === "running" || runningId === sessionId
              }
            />
          ) : null}
          {session ? <ChatNativeActivity session={session} /> : null}
        </>
      ) : null}
    </ChatLayout>
  );
}
