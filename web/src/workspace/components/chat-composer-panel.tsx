import { useRef, useState } from "react";
import type { ChatProvider, ChatUsage, Project } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCube, faPaperclip, faMicrophone, faArrowUp, faStop } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { ComposerModelSelection } from "./composer-model-selection";
import { ComposerProjectContext } from "./composer-project-context";
import { Banner } from "@astryxdesign/core/Banner";
import { ComposerAttachment } from "./composer-attachment";
import { HStack } from "@astryxdesign/core/HStack";
import { ChatContextProgress } from "./chat-context-progress";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
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
  onSubmit: (text: string, systemPrompt: string) => void;
  onStop: () => void;
}

interface Attachment {
  id: string;
  name: string;
  text: string;
  preview: string;
  size: number;
  isImage: boolean;
}

export function ChatComposerPanel(props: Props) {
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const provider = props.providers.find(
    (entry) => entry.id === props.providerId,
  );
  const model = provider?.models.find((entry) => entry.id === props.modelId);
  const error = attachmentError || props.error || provider?.error || "";
  const contextTokens = props.usage.inputTokens + props.usage.outputTokens;
  const disabled =
    !props.isReady ||
    !provider?.available ||
    !model ||
    props.isBusy ||
    isReadingFiles;

  async function attach(files: File[]) {
    if (isReadingFiles) {
      return;
    }
    setIsReadingFiles(true);
    try {
      if (
        files.length + attachments.length > 5 ||
        files.some(
          (file) =>
            file.size > (file.type.startsWith("image/") ? 5_000_000 : 20_000) ||
            !(
              /^(image\/(png|jpeg|webp)|text\/|application\/(json|yaml|xml))/.test(
                file.type,
              ) ||
              /\.(txt|md|csv|json|ya?ml|tsx?|jsx?|py|css|html|xml|log)$/i.test(
                file.name,
              )
            ),
        )
      ) {
        throw new Error(
          "Attach up to 5 files: text or code under 20 KB, or PNG, JPEG, and WebP images under 5 MB.",
        );
      }
      const next = await Promise.all(
        files.map(async (file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          text: file.type.startsWith("image/") ? "" : await file.text(),
          preview: file.type.startsWith("image/")
            ? await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () =>
                  reject(new Error("Unable to read image"));
                reader.readAsDataURL(file);
              })
            : "",
          size: file.size,
          isImage: file.type.startsWith("image/"),
        })),
      );
      if (next.some((file) => file.text.includes("\0"))) {
        throw new Error("Only text files are supported");
      }
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
    if (disabled || !value.trim()) {
      return;
    }
    if (attachments.some((file) => file.isImage)) {
      setAttachmentError(
        "Image previews are ready, but this provider connection does not support sending images yet. Remove images to send your message.",
      );
      return;
    }

    const text =
      value.trim() +
      attachments
        .map((file) => `\n\nAttached file: ${file.name}\n${file.text}`)
        .join("");
    if (text.length > 100_000) {
      setAttachmentError(
        "Message and attachments must fit within 100,000 characters.",
      );
      return;
    }
    props.onSubmit(text, "");
    setDraft("");
    setAttachments([]);
  }

  return (
    <VStack gap={2} className="mx-auto w-full max-w-4xl px-4 pb-4">
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,text/*,.json,.yaml,.yml,.xml,.ts,.tsx,.js,.jsx,.py,.md,.csv"
        className="hidden"
        aria-label="Attach files"
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
                aria-label="Attachment previews"
                tabIndex={0}
              >
                {attachments.map((file) => (
                  <ComposerAttachment
                    key={file.id}
                    name={file.name}
                    text={file.text}
                    preview={file.preview}
                    size={file.size}
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
            {error && <Banner status="error" title={error} />}
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Button
                label={isReadingFiles ? "Reading files…" : "Attach files"}
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

              <HStack gap={3} vAlign="center" className="ml-auto">
                {props.hasMessages && model && model.contextWindow > 0 && (
                  <ChatContextProgress
                    tokens={contextTokens}
                    limit={model.contextWindow}
                  />
                )}
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
