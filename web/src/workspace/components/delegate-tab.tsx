import type { ChatAttachment, CollabParticipant, CollabTask, ProviderCliId } from "@veykor/shared";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useChatDefaultsStore } from "../chat-defaults-store";
import { emptyUsage, useChatSessionsStore, type SessionMessage } from "../chat-sessions-store";
import { chatAction, useChatRuntimeStore } from "../chat-runtime-store";
import { useSettingsStore } from "../../settings/settings-store";
import { useCollabStore } from "../collab-store";
import { ChatComposerPanel } from "./chat-composer-panel";
import { ChatNativeActivity } from "./chat-native-activity";
import { ConversationMessages } from "./conversation-messages";

const noMessages: SessionMessage[] = [];

interface Props {
  conversationId: string;
  visible: boolean;
  participants: CollabParticipant[];
  tasks: CollabTask[];
}

function nameFor(participants: CollabParticipant[], conversationId: string) {
  return (
    participants.find((entry) => entry.conversationId === conversationId)
      ?.agentName || "Delegate"
  );
}

export function DelegateTab(props: Props) {
  const session = useChatSessionsStore(
    (state) => state.internalSessions[props.conversationId],
  );
  const messages = useChatSessionsStore(
    (state) => state.messages[props.conversationId] || noMessages,
  );
  const runningId = useChatRuntimeStore((state) => state.runningSessionId);
  const runtimeError = useChatRuntimeStore((state) =>
    state.errorSessionId === props.conversationId ? state.error : "",
  );
  const runtimeErrorKind = useChatRuntimeStore((state) =>
    state.errorSessionId === props.conversationId ? state.errorKind : "",
  );
  const providers = useSettingsStore((state) => state.providers);
  const messageBehavior = useChatDefaultsStore(
    (state) => state.messageBehavior,
  );
  const interrupt = useCollabStore((state) => state.interrupt);

  const activeTask = props.tasks.find(
    (task) =>
      task.conversationId === props.conversationId &&
      task.state !== "completed" &&
      task.state !== "interrupted" &&
      task.state !== "failed" &&
      task.state !== "blocked",
  );

  async function submit(
    text: string,
    systemPrompt: string,
    attachments: ChatAttachment[],
  ) {
    if (!session) {
      return false;
    }

    const store = useChatSessionsStore.getState();
    const willWait =
      session.status === "running" ||
      runningId === session.id ||
      (session.queuedMessages || []).length > 0;

    if (!willWait) {
      store.addMessage(session.id, text, attachments);
    }

    const message = willWait
      ? { id: crypto.randomUUID(), text, attachments }
      : useChatSessionsStore.getState().messages[session.id].at(-1)!;

    const sent = await useChatRuntimeStore.getState().send(session.id, {
      delivery: messageBehavior,
      conversationId: session.id,
      messageId: message.id,
      permissionMode: session.permissionMode || "promptUnmatched",
      reasoningEffort: session.reasoningEffort || "max",
      providerId: session.providerId as ProviderCliId,
      modelId: session.modelId,
      messages: [
        { role: "user", text: message.text, attachments: message.attachments },
      ],
      systemPrompt,
    });

    const interruption = useChatRuntimeStore.getState().lastInterruption;

    if (interruption && interruption.sessionId === session.id) {
      store.removeMessage(session.id, message.id);
      void useCollabStore.getState().refresh();
    }

    return sent;
  }

  async function stop() {
    if (activeTask) {
      await interrupt(activeTask.id);
      return;
    }

    if (session) {
      await chatAction(session.id, "stop", {}).catch((error) =>
        useChatRuntimeStore.setState({
          error: error instanceof Error ? error.message : "Stop failed",
          errorKind: "rejected",
          errorSessionId: session.id,
        }),
      );
    }
  }

  if (!session) {
    return (
      <Text className="px-4 py-6 text-(--color-text-secondary)">
        Select a delegate to view its conversation.
      </Text>
    );
  }

  return (
    <VStack
      gap={0}
      className={
        props.visible ? "min-h-0 min-w-0 flex-1" : "hidden min-h-0 min-w-0"
      }
    >
      <HStack gap={2} vAlign="center" className="shrink-0 px-4 pt-3">
        <Text className="font-semibold">
          {nameFor(props.participants, session.id)}
        </Text>

        {activeTask && (
          <Text className="truncate text-(--color-text-secondary)">
            {activeTask.title}
          </Text>
        )}
      </HStack>

      <VStack gap={0} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {messages.length > 0 || (session.approvals || []).length > 0 ? (
          <>
            {messages.length > 0 ? (
              <ConversationMessages
                messages={messages}
                isRunning={
                  session.status === "running" || runningId === session.id
                }
              />
            ) : null}
          </>
        ) : (
          <Text className="mx-auto w-full max-w-4xl px-4 py-6 text-(--color-text-secondary)">
            Waiting for the first task from the lead.
          </Text>
        )}
      </VStack>

      <VStack gap={0} className="shrink-0">
        <ChatNativeActivity key={session.id} session={session} />

        <ChatComposerPanel
          key={`delegate-${session.id}`}
          minimalControls
          sessionId={session.id}
          queuedMessages={session.queuedMessages || []}
          queuePaused={session.queuePaused || false}
          messageBehavior={messageBehavior}
          permissionMode={session.permissionMode || "promptUnmatched"}
          onPermissionMode={() => {}}
          reasoningEffort={session.reasoningEffort || "max"}
          onReasoningEffort={() => {}}
          isNewProjectChat={false}
          providers={providers}
          isProviderLocked
          providerId={session.providerId}
          modelId={session.modelId}
          preferredModels={{}}
          loading={false}
          isReady
          isRunning={session.status === "running" || runningId === session.id}
          isBusy={!!runningId}
          error={runtimeError || session.error || ""}
          errorKind={runtimeError ? runtimeErrorKind : ""}
          usage={
            messages.filter((entry) => entry.role === "assistant").at(-1)
              ?.usage || emptyUsage()
          }
          hasMessages={messages.some((entry) => entry.role === "user")}
          onSelection={() => {}}
          onSubmit={submit}
          onStop={() => void stop()}
        />
      </VStack>
    </VStack>
  );
}
