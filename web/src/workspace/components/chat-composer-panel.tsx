import { useRef, useState } from "react";
import type { ChatPermissionMode, ChatAttachment, ChatProvider, ChatUsage, Project } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCube, faPaperclip, faMicrophone, faArrowUp, faStop } from "@fortawesome/free-solid-svg-icons";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { ComposerModelSelection } from "./composer-model-selection";
import { ComposerProjectContext } from "./composer-project-context";
import { Banner } from "@astryxdesign/core/Banner";
import { ComposerAttachment } from "./composer-attachment";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { getAttachmentKind, isImageFile, openInNewTab, readFileAsDataUrl } from "../chat-attachments";

interface Props {
  permissionMode: ChatPermissionMode;
  onPermissionMode: (mode: ChatPermissionMode) => void;
  project?: Project;
  isNewProjectChat: boolean;
  providers: ChatProvider[];
  providerId: string;
  modelId: string;
  loading: boolean;
  isReady: boolean;
  isRunning: boolean;
  isBusy: boolean;
  error: string;
  usage: ChatUsage;
  hasMessages: boolean;
  onSelection: (providerId: string, modelId: string) => void;
  onSubmit: (
    text: string,
    systemPrompt: string,
    attachments: ChatAttachment[],
  ) => void;
  onStop: () => void;
}

export function ChatComposerPanel(props: Props) {
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const provider = props.providers.find(
    (entry) => entry.id === props.providerId,
  );
  const model = provider?.models.find((entry) => entry.id === props.modelId);
  const error = attachmentError || props.error || provider?.error || "";
  const disabled =
    !props.isReady ||
    !provider?.available ||
    !model ||
    props.isBusy ||
    isReadingFiles;

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

  function submit(value: string) {
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

    props.onSubmit(text, "", attachments);
    setDraft("");
    setAttachments([]);
  }

  return (
    <VStack gap={2} className="mx-auto w-full max-w-4xl px-4 pb-4">
      {error && <Banner status="error" title={error} />}

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
        <form
          className="relative z-10 min-w-0 rounded-(--radius-chat) border border-solid border-(--color-border-emphasized) bg-(--color-background-body) p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
          onKeyDown={(event) => {
            if (
              event.target instanceof HTMLTextAreaElement &&
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit(draft);
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
              disabled={disabled}
              placeholder="What would you like to work on?"
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
                isDisabled={props.isBusy || isReadingFiles}
                icon={<FontAwesomeIcon icon={faPaperclip} />}
                clickAction={() => fileInput.current?.click()}
              />

              <HStack className="hidden! min-w-0 md:flex!">
                <ComposerModelSelection
                  providers={props.providers}
                  providerId={props.providerId}
                  modelId={props.modelId}
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

              <Selector
                label="Permission mode"
                isLabelHidden
                size="sm"
                variant="ghost"
                value={props.permissionMode}
                options={[
                  {
                    value: "promptUnmatched",
                    label: "Ask for unmatched actions",
                  },
                  { value: "onRequest", label: "Ask on request" },
                  { value: "denyUnmatched", label: "Deny unmatched actions" },
                  { value: "allowAll", label: "Allow all" },
                ]}
                onChange={(mode) =>
                  props.onPermissionMode(mode as ChatPermissionMode)
                }
              />

              <HStack gap={3} vAlign="center" className="ml-auto">
                <Button
                  label="Transcription coming soon"
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  className="hover:bg-(--color-background-red)! hover:text-(--color-text-red)!"
                  icon={<FontAwesomeIcon icon={faMicrophone} />}
                />

                {props.isRunning ? (
                  <Button
                    label="Stop response"
                    size="sm"
                    isIconOnly
                    variant="secondary"
                    icon={<FontAwesomeIcon icon={faStop} />}
                    clickAction={props.onStop}
                  />
                ) : (
                  <Button
                    className="rounded-full!"
                    label="Send message"
                    type="submit"
                    size="sm"
                    isIconOnly
                    isDisabled={disabled || !draft.trim()}
                    icon={<FontAwesomeIcon icon={faArrowUp} />}
                  />
                )}
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
                  modelId={props.modelId}
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
