import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { ProviderCliId } from "@veykor/shared";
import { Center } from "@astryxdesign/core/Center";
import { ChatLayout } from "@astryxdesign/core/Chat";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/VStack";
import { useChatSessionsStore, emptyUsage, type SessionMessage } from "./chat-sessions-store";
import { useSidebarSectionsStore } from "./sidebar-sections-store";
import { useSettingsStore } from "../settings/settings-store";
import type { ChatDraft } from "./chat-draft";
import { useChatRuntimeStore } from "./chat-runtime-store";
import { ChatComposerPanel } from "./components/chat-composer-panel";
import { ConversationMessages } from "./components/conversation-messages";
import { useProjectsStore } from "./projects-store";
import { chatGreeting } from "./chat-greeting";

const noMessages: SessionMessage[] = [];

export function ProjectHomePage() {
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const location = useLocation();
  const draft = (location.state as { draft?: ChatDraft } | null)?.draft;
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const sessions = useChatSessionsStore((state) => state.sessions);
  const status = useChatSessionsStore((state) => state.status);
  const historyError = useChatSessionsStore((state) => state.error);
  const messages = useChatSessionsStore((state) =>
    sessionId ? state.messages[sessionId] || noMessages : noMessages,
  );
  const projects = useProjectsStore((state) => state.projects);
  const session = sessions.find((entry) => entry.id === sessionId);
  const providers = useSettingsStore((state) => state.providers);
  const loading = useSettingsStore(
    (state) => state.status === "idle" || state.status === "loading",
  );
  const catalogError = useSettingsStore((state) => state.error);
  const runningId = useChatRuntimeStore((state) => state.runningSessionId);
  const runtimeError = useChatRuntimeStore((state) =>
    state.errorSessionId === sessionId ? state.error : "",
  );
  const stop = useChatRuntimeStore((state) => state.stop);
  const sections = useSidebarSectionsStore((state) => state.sections);
  const defaultSection =
    sections.find(
      (section) => section.kind === "chats" && section.id === draft?.sectionId,
    ) ||
    sections.find((section) => section.kind === "chats" && section.isFixed) ||
    sections.find((section) => section.kind === "chats");
  const preferredProviderId = session?.providerId || defaultProvider;
  const provider =
    providers.find(
      (entry) => entry.available && entry.id === preferredProviderId,
    ) || providers.find((entry) => entry.available);
  const providerId = provider?.id || "";
  const preferredModelId =
    session?.providerId === providerId ? session.modelId : defaultModel;
  const modelId =
    provider?.models.find((entry) => entry.id === preferredModelId)?.id ||
    provider?.models[0]?.id ||
    "";
  const lastReply = messages
    .filter((message) => message.role === "assistant")
    .at(-1);
  const missingSession = !!sessionId && status === "ready" && !session;
  const ready =
    status === "ready" &&
    !missingSession &&
    (!!session || !!draft?.projectId || !!defaultSection);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  function select(providerId: string, modelId: string) {
    useChatRuntimeStore.setState({ error: "", errorSessionId: "" });

    if (session) {
      useChatSessionsStore
        .getState()
        .configure(session.id, providerId, modelId);
    } else {
      setDefaultProvider(providerId);
      setDefaultModel(modelId);
    }
  }

  function submit(text: string, systemPrompt: string) {
    if (!ready || runningId) {
      return;
    }
    const store = useChatSessionsStore.getState();
    const target =
      session ||
      (draft?.projectId
        ? store.createProjectSession(draft.projectId)
        : store.createChatSession(defaultSection!.id));
    store.addMessage(target.id, text);
    store.configure(target.id, providerId, modelId);
    const history = useChatSessionsStore
      .getState()
      .messages[target.id].filter((message) => message.text)
      .map((message) => ({ role: message.role, text: message.text }));
    navigate(`/chat/${target.id}`);
    void useChatRuntimeStore.getState().send(target.id, {
      providerId: providerId as ProviderCliId,
      modelId,
      messages: history,
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
          isNewProjectChat={!sessionId && !!draft?.projectId}
          project={projects.find(
            (project) =>
              project.id === (session?.projectId || draft?.projectId),
          )}
          providers={providers}
          providerId={providerId}
          modelId={modelId}
          loading={loading}
          isReady={ready}
          isRunning={runningId === sessionId}
          isBusy={!!runningId}
          error={runtimeError || historyError || catalogError}
          usage={lastReply?.usage || emptyUsage()}
          hasMessages={messages.some((message) => message.role === "user")}
          onSelection={select}
          onSubmit={submit}
          onStop={stop}
        />
      }
    >
      {messages.length > 0 ? (
        <ConversationMessages
          messages={messages}
          isRunning={runningId === sessionId}
        />
      ) : null}
    </ChatLayout>
  );
}
