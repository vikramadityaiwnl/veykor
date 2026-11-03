import { useEffect, useRef, useState } from "react";
import type { ChatMessageBehavior, ProjectAgent, QueuedChatMessage, ChatPermissionMode, ChatAttachment, ChatProvider, ChatReasoningEffort, ChatUsage, Project } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCube, faPaperclip, faArrowUp, faStop } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { ComposerModelSelection } from "./composer-model-selection";
import { ChatContextProgress } from "./chat-context-progress";
import { ChatEffortSelection } from "./chat-effort-selection";
import { ChatPermissionSelection } from "./chat-permission-selection";
import { ComposerQueue } from "./composer-queue";
import { ComposerProjectContext } from "./composer-project-context";
import { ComposerTranscribeButton } from "./composer-transcribe-button";
import { Banner } from "@astryxdesign/core/Banner";
import { ComposerAttachment } from "./composer-attachment";
import { AgentSelector } from "../../agents/components/agent-selector";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { getAttachmentKind, isImageFile, openInNewTab, readFileAsDataUrl } from "../chat-attachments";
import { appendTranscript, useTranscribeRecorder } from "../transcribe-recorder";

interface Props {
  minimalControls?: boolean;
  isProjectChat?: boolean;
  agents?: ProjectAgent[];
  agentId?: string;
  agentName?: string;
  isAgentLocked?: boolean;
  agentMissing?: boolean;
  onAgentChange?: (agentId: string) => void;
  sessionId: string;
  queuedMessages: QueuedChatMessage[];
  queuePaused: boolean;
  messageBehavior: ChatMessageBehavior;
  permissionMode: ChatPermissionMode;
  onPermissionMode: (mode: ChatPermissionMode) => void;
  reasoningEffort: ChatReasoningEffort;
  onReasoningEffort: (effort: ChatReasoningEffort) => void;
  project?: Project;
  isNewProjectChat: boolean;
  providers: ChatProvider[];
  isProviderLocked: boolean;
  providerId: string;
  modelId: string;
  preferredModels: Record<string, string>;
  loading: boolean;
  isReady: boolean;
  isRunning: boolean;
  isBusy: boolean;
  error: string;
  errorKind: "" | "rejected" | "uncertain";
  usage: ChatUsage;
  hasMessages: boolean;
  onSelection: (providerId: string, modelId: string) => void;
  onSubmit: (
    text: string,
    systemPrompt: string,
    attachments: ChatAttachment[],
  ) => Promise<boolean>;
  onStop: () => void;
}

export function ChatComposerPanel(props: Props) {
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  const transcriptBase = useRef("");

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const recorder = useTranscribeRecorder({
    onStart: () => {
      transcriptBase.current = draftRef.current;
    },
    onPartial: (text) => {
      setDraft(appendTranscript(transcriptBase.current, text));
    },
    onFinal: (text) => {
      transcriptBase.current = appendTranscript(transcriptBase.current, text);
      setDraft(transcriptBase.current);
    },
  });

  const transcribing =
    recorder.status === "recording" || recorder.status === "stopping";
  const provider = props.providers.find(
    (entry) => entry.id === props.providerId,
  );
  const model = provider?.models.find((entry) => entry.id === props.modelId);
  const error = attachmentError || props.error || provider?.error || "";
  const contextTokens = props.usage.inputTokens + props.usage.outputTokens;
  const disabled =
    !props.isReady ||
    !!props.agentMissing ||
    !provider?.available ||
    !model ||
    isReadingFiles ||
    isSubmitting;

  async function attach(files: File[]) {
    if (isReadingFiles || files.length === 0) {
      return;
    }

    setIsReadingFiles(true);

    try {
      if (files.length + attachments.length > 5) {
        throw new Error("Attach up to 5 files per message.");
      }

      if (files.some((file) => file.size > 10_000_000)) {
        throw new Error("Each file must be under 10 MB.");
      }

      if (files.some((file) => !isImageFile(file))) {
        throw new Error("Only image files can be attached for now.");
      }

      const next = await Promise.all(
        files.map(async (file) => {
          if (!model?.inputModalities?.includes("image")) {
            throw new Error(
              "This model has no verified native image input support.",
            );
          }
          const dataUrl = await readFileAsDataUrl(file);

          return {
            id: crypto.randomUUID(),
            name: file.name,
            mimeType: file.type,
            size: file.size,
            kind: getAttachmentKind(file.type, file.name),
            dataUrl,
            text: "",
          } satisfies ChatAttachment;
        }),
      );

      setAttachments((current) => [...current, ...next]);
      setAttachmentError("");
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : "Unable to read attachment",
      );
    } finally {
      setIsReadingFiles(false);
    }
  }

  function toggleTranscription() {
    if (recorder.status === "idle") {
      void recorder.start();
    } else if (recorder.status === "recording") {
      recorder.stop();
    }
  }

  async function submit(value: string) {
    if (transcribing) {
      recorder.cancel();
    }

    if (disabled) {
      return;
    }

    const text = value.trim();

    if (!text) {
      return;
    }

    if (text.length > 100_000) {
      setAttachmentError("Message must fit within 100,000 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (await props.onSubmit(text, "", attachments)) {
        setDraft("");
        setAttachments([]);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <VStack gap={2} className="mx-auto w-full max-w-4xl px-4 pb-4">
      {error && (
        <Banner
          status="error"
          title={
            props.errorKind === "uncertain"
              ? `${error} Nothing was resent automatically.`
              : props.errorKind === "rejected"
                ? `${error} Your text and images are still here; edit them or send again.`
                : error
          }
        />
      )}

      {props.isProjectChat &&
        !props.isAgentLocked &&
        (props.agents || []).length === 0 && (
          <Banner
            status="info"
            title="No agents available for this project. Create an agent from Agents and assign it to this project to start chatting."
          />
        )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="Attach images"
        onChange={(event) => {
          void attach(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />

      <VStack gap={0} className="min-w-0">
        {props.queuedMessages.length > 0 && (
          <ComposerQueue
            key={props.sessionId}
            sessionId={props.sessionId}
            messages={props.queuedMessages}
            paused={props.queuePaused}
          />
        )}
        <form
          className="relative z-10 min-w-0 rounded-(--radius-chat) border border-solid border-(--color-border-emphasized) bg-(--color-background-surface) p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(draft);
          }}
          onKeyDown={(event) => {
            if (
              event.target instanceof HTMLTextAreaElement &&
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit(draft);
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void attach(Array.from(event.dataTransfer.files));
          }}
        >
          <VStack gap={3}>
            {attachments.length > 0 && (
              <HStack
                gap={3}
                className="min-w-0 overflow-x-auto pb-2"
                role="region"
                aria-label="Image previews"
                tabIndex={0}
              >
                {attachments.map((file) => (
                  <ComposerAttachment
                    key={file.id}
                    attachment={file}
                    onOpen={() => openInNewTab(file.dataUrl)}
                    onRemove={() => {
                      setAttachments((current) =>
                        current.filter((entry) => entry.id !== file.id),
                      );
                      setAttachmentError("");
                    }}
                  />
                ))}
              </HStack>
            )}

            <textarea
              aria-label="Message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={disabled || transcribing}
              placeholder={
                transcribing ? "Listening…" : "What would you like to work on?"
              }
              rows={3}
              className="veykor-composer-input w-full resize-none border-0 bg-transparent px-1 py-2 text-base font-light text-(--color-text-primary) outline-none placeholder:text-(--color-text-secondary)"
              onPaste={(event) => {
                if (event.clipboardData.files.length > 0) {
                  event.preventDefault();
                  void attach(Array.from(event.clipboardData.files));
                }
              }}
            />

            <HStack gap={2} vAlign="center" wrap="wrap">
              <Button
                label={isReadingFiles ? "Reading images…" : "Attach images"}
                size="sm"
                variant="ghost"
                isIconOnly
                isDisabled={isReadingFiles}
                icon={<FontAwesomeIcon icon={faPaperclip} />}
                clickAction={() => fileInput.current?.click()}
              />

              {props.minimalControls ? null : props.isProjectChat ? (
                <AgentSelector
                  agents={props.agents || []}
                  value={props.agentId || ""}
                  isLocked={!!props.isAgentLocked}
                  lockedName={props.agentName || ""}
                  onChange={(agentId) => props.onAgentChange?.(agentId)}
                />
              ) : (
                <>
                  <HStack className="hidden! min-w-0 md:flex!">
                    <ComposerModelSelection
                      providers={props.providers}
                      providerId={props.providerId}
                      isProviderLocked={props.isProviderLocked}
                      modelId={props.modelId}
                      preferredModels={props.preferredModels}
                      loading={props.loading}
                      onSelection={props.onSelection}
                    />
                  </HStack>

                  <HStack className="md:hidden!">
                    <Button
                      label="Choose provider and model"
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      icon={<FontAwesomeIcon icon={faCube} />}
                      clickAction={() => setIsModelDialogOpen(true)}
                    />
                  </HStack>

                  <ChatEffortSelection
                    model={model}
                    value={props.reasoningEffort}
                    onChange={props.onReasoningEffort}
                  />
                </>
              )}

              <HStack gap={3} vAlign="center" className="ml-auto">
                {!props.minimalControls &&
                  props.hasMessages &&
                  model &&
                  model.contextWindow > 0 && (
                    <ChatContextProgress
                      tokens={contextTokens}
                      limit={model.contextWindow}
                    />
                  )}

                {!props.minimalControls && (
                  <ChatPermissionSelection
                    providerId={props.providerId}
                    value={props.permissionMode}
                    onChange={props.onPermissionMode}
                  />
                )}

                <ComposerTranscribeButton
                  status={recorder.status}
                  error={recorder.error}
                  onToggle={toggleTranscription}
                  onDismissError={recorder.clearError}
                />

                {props.isRunning && (
                  <Button
                    label="Stop response"
                    size="sm"
                    isIconOnly
                    variant="secondary"
                    icon={<FontAwesomeIcon icon={faStop} />}
                    clickAction={props.onStop}
                  />
                )}
                <Button
                  className="rounded-full!"
                  label={
                    props.isRunning
                      ? props.messageBehavior === "queue"
                        ? "Queue message"
                        : "Steer message"
                      : "Send message"
                  }
                  type="submit"
                  size="sm"
                  isIconOnly
                  isDisabled={disabled || !draft.trim()}
                  icon={<FontAwesomeIcon icon={faArrowUp} />}
                />
              </HStack>
            </HStack>
          </VStack>
        </form>

        {props.isNewProjectChat && props.project && (
          <ComposerProjectContext
            key={props.project.id}
            project={props.project}
          />
        )}

        <Dialog isOpen={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
          <Layout
            header={
              <DialogHeader
                title="Provider and model"
                onOpenChange={setIsModelDialogOpen}
              />
            }
            content={
              <LayoutContent>
                <ComposerModelSelection
                  providers={props.providers}
                  providerId={props.providerId}
                  isProviderLocked={props.isProviderLocked}
                  modelId={props.modelId}
                  preferredModels={props.preferredModels}
                  loading={props.loading}
                  onSelection={props.onSelection}
                  isCompact
                />
              </LayoutContent>
            }
          />
        </Dialog>
      </VStack>
    </VStack>
  );
}
