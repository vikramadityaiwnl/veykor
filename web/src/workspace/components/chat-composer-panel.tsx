import { useRef, useState } from "react";
import type { ChatProvider, ChatUsage } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCube, faPaperclip } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { ChatComposer, ChatComposerDrawer, ChatComposerInput, ChatSendButton } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { ChatProviderIcon } from "./chat-provider-icon";

interface Props {
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
}

export function ChatComposerPanel(props: Props) {
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
            file.size > 20_000 ||
            !(
              /^(text\/|application\/(json|yaml|xml))/.test(file.type) ||
              /\.(txt|md|csv|json|ya?ml|tsx?|jsx?|py|css|html|xml|log)$/i.test(
                file.name,
              )
            ),
        )
      ) {
        throw new Error(
          "Attach up to 5 text or code files, each under 20 KB. PDF and binary files are not supported yet.",
        );
      }
      const next = await Promise.all(
        files.map(async (file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          text: await file.text(),
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
        accept="text/*,.json,.yaml,.yml,.xml,.ts,.tsx,.js,.jsx,.py,.md,.csv"
        className="hidden"
        aria-label="Attach text files"
        onChange={(event) => {
          void attach(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        placeholder={
          provider?.available
            ? "Send a message…"
            : "Choose an available provider to chat…"
        }
        elevation="none"
        className="[&>div]:shadow-none! [&>div]:outline-none! [&>div]:border-(--color-border-emphasized)!"
        isStopShown={props.isRunning}
        onStop={props.onStop}
        sendButton={<ChatSendButton isDisabled={disabled || !draft.trim()} />}
        input={
          <ChatComposerInput
            isDisabled={disabled}
            onFiles={(files) => {
              void attach(files);
            }}
            pasteAsToken={false}
          />
        }
        status={error ? { type: "error", message: error } : undefined}
        drawer={
          attachments.length > 0 ? (
            <ChatComposerDrawer count={attachments.length}>
              {attachments.map((file) => (
                <Token
                  key={file.id}
                  label={file.name}
                  onRemove={() => {
                    setAttachments((current) =>
                      current.filter((entry) => entry.id !== file.id),
                    );
                  }}
                />
              ))}
            </ChatComposerDrawer>
          ) : undefined
        }
        headerContext={
          props.hasMessages && model && model.contextWindow > 0 ? (
            <HStack className="w-24" vAlign="center">
              <ProgressBar
                label="Estimated context usage from the last reply"
                isLabelHidden
                value={Math.min(contextTokens, model.contextWindow)}
                max={model.contextWindow}
              />
            </HStack>
          ) : undefined
        }
        footerActions={
          <HStack gap={1} wrap="wrap" className="min-w-0">
            <Button
              label={isReadingFiles ? "Reading files…" : "Attach text files"}
              size="sm"
              variant="ghost"
              isIconOnly
              isDisabled={props.isBusy || isReadingFiles}
              icon={
                <FontAwesomeIcon
                  icon={faPaperclip}
                  className="size-(--spacing-3)!"
                />
              }
              clickAction={() => fileInput.current?.click()}
            />
            <Selector
              startIcon={<ChatProviderIcon providerId={props.providerId} />}
              label="Provider"
              isLabelHidden
              variant="ghost"
              size="sm"
              value={props.providerId}
              isLoading={props.loading}
              options={props.providers.map((entry) => ({
                value: entry.id,
                label: entry.name,
                icon: <ChatProviderIcon providerId={entry.id} />,
              }))}
              onChange={(id) => {
                props.onSelection(
                  id,
                  props.providers.find((entry) => entry.id === id)?.models[0]
                    ?.id || "",
                );
              }}
            />
            <Selector
              startIcon={<FontAwesomeIcon icon={faCube} aria-hidden="true" />}
              label="Model"
              isLabelHidden
              variant="ghost"
              size="sm"
              hasSearch
              value={props.modelId}
              options={(provider?.models || []).map((entry) => ({
                value: entry.id,
                label: entry.name,
                icon: <FontAwesomeIcon icon={faCube} aria-hidden="true" />,
              }))}
              emptyText="No models available"
              onChange={(id) => props.onSelection(props.providerId, id)}
            />
          </HStack>
        }
      />
    </VStack>
  );
}
