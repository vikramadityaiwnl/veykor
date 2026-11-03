import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  MicrophoneIcon,
  PaperClipIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StopIcon } from "@heroicons/react/24/solid";
import { usePreferencesStore } from "../../workspace/preferences-store.ts";
import Dialog from "../../components/dialog/dialog.tsx";
import LoadingSpinner from "../../components/loading-spinner/loading-spinner.tsx";
import ComposerPanel from "./composer-panel.tsx";
import EffortPicker from "./effort-picker.tsx";
import ModelPicker from "./model-picker.tsx";
import PermissionPicker from "./permission-picker.tsx";
import { useChatStore } from "../chat-store.ts";
import {
  classifyMicrophoneFailure,
  queryMicrophonePermission,
  startTranscription,
} from "../transcription-client.ts";
import type { ActiveTranscription } from "../transcription-client.ts";

type VoicePhase = "idle" | "connecting" | "listening" | "stopping";

function ChatComposer() {
  const send = useChatStore((s) => s.send);
  const cancelTurn = useChatStore((s) => s.cancelTurn);
  const streaming = useChatStore((s) => s.streaming);
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);
  const todos = useChatStore((s) => s.todos);
  const queuedMessages = useChatStore((s) => s.queuedMessages);
  const composerRestore = useChatStore((s) => s.composerRestore);
  const composerImages = useChatStore((s) => s.composerImages);
  const addImages = useChatStore((s) => s.addImages);
  const removeImage = useChatStore((s) => s.removeImage);
  const interruptionBehavior = usePreferencesStore(
    (s) => s.interruptionBehavior,
  );

  const [draft, setDraft] = useState("");
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [micBlocked, setMicBlocked] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const voiceSessionRef = useRef<ActiveTranscription | null>(null);
  const voicePrefixRef = useRef("");
  const voiceRunRef = useRef(0);

  const panelOpen =
    pendingApprovals.length > 0 ||
    todos.length > 0 ||
    queuedMessages.length > 0;
  const canSend = draft.trim() !== "" || composerImages.length > 0;
  const showStop = streaming && !canSend;
  const sendTitle = streaming
    ? interruptionBehavior === "steer"
      ? "Steer the running turn"
      : "Queue message"
    : "Send";
  const voiceActive = voicePhase !== "idle";
  const placeholder =
    voicePhase === "connecting"
      ? "Connecting…"
      : voiceActive
        ? "Listening…"
        : "Ask anything…";

  function autoresize() {
    const textarea = textareaRef.current;

    if (textarea === null) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }

  useEffect(() => {
    if (composerRestore.seq === 0) {
      return;
    }

    setDraft(composerRestore.text);

    const frame = window.requestAnimationFrame(() => {
      autoresize();
      textareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [composerRestore]);

  const stopVoiceSession = useCallback(async (): Promise<string | null> => {
    voiceRunRef.current += 1;

    const session = voiceSessionRef.current;

    voiceSessionRef.current = null;

    if (session === null) {
      setVoicePhase("idle");

      return null;
    }

    setVoicePhase("stopping");

    try {
      return await session.stop();
    } catch {
      return null;
    } finally {
      setVoicePhase("idle");
    }
  }, []);

  const stopVoice = useCallback(async (): Promise<void> => {
    const text = await stopVoiceSession();

    if (text !== null) {
      setDraft(voicePrefixRef.current + text);
      autoresize();
    }

    textareaRef.current?.focus();
  }, [stopVoiceSession]);

  useEffect(() => {
    if (voicePhase !== "listening" && voicePhase !== "connecting") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        void stopVoice();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [voicePhase, stopVoice]);

  useEffect(() => {
    return () => {
      voiceRunRef.current += 1;
      voiceSessionRef.current?.abort();
      voiceSessionRef.current = null;
    };
  }, []);

  async function startVoice() {
    const run = voiceRunRef.current + 1;

    voiceRunRef.current = run;
    setVoiceError("");

    const permission = await queryMicrophonePermission();

    if (voiceRunRef.current !== run) {
      return;
    }

    if (permission === "denied") {
      setMicBlocked(true);

      return;
    }

    setVoicePhase("connecting");

    if (draft === "" || draft.endsWith(" ") || draft.endsWith("\n")) {
      voicePrefixRef.current = draft;
    } else {
      voicePrefixRef.current = `${draft} `;
    }

    let session: ActiveTranscription;

    try {
      session = await startTranscription({
        onReady: () => {
          if (voiceRunRef.current === run) {
            setVoicePhase("listening");
          }
        },
        onTranscript: (text) => {
          if (voiceRunRef.current === run) {
            setDraft(voicePrefixRef.current + text);
            autoresize();
          }
        },
        onError: (message) => {
          if (voiceRunRef.current === run) {
            setVoiceError(message);
          }
        },
        onClosed: () => {
          if (voiceRunRef.current === run) {
            voiceSessionRef.current = null;
            setVoicePhase("idle");
          }
        },
      });
    } catch (cause) {
      if (voiceRunRef.current !== run) {
        return;
      }

      setVoicePhase("idle");

      if (cause instanceof DOMException) {
        const failure = classifyMicrophoneFailure(
          cause,
          await queryMicrophonePermission(),
        );

        if (failure.kind === "blocked") {
          setMicBlocked(true);
        } else {
          setVoiceError(failure.message);
        }
      } else {
        setVoiceError(
          cause instanceof Error && cause.message !== ""
            ? cause.message
            : "Voice input failed to start.",
        );
      }

      return;
    }

    if (voiceRunRef.current !== run) {
      session.abort();

      return;
    }

    voiceSessionRef.current = session;
  }

  async function handleSend() {
    let text = draft;

    if (voiceSessionRef.current !== null || voicePhase !== "idle") {
      const finalText = await stopVoiceSession();

      if (finalText !== null) {
        text = voicePrefixRef.current + finalText;
        setDraft(text);
      }
    }

    if (text.trim() === "" && composerImages.length === 0) {
      return;
    }

    send(text);
    setDraft("");

    const textarea = textareaRef.current;

    if (textarea !== null) {
      textarea.style.height = "auto";
      textarea.focus();
    }
  }

  function handleFiles(files: FileList | null) {
    if (files === null || files.length === 0) {
      return;
    }

    addImages(Array.from(files));

    if (fileRef.current !== null) {
      fileRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      {voiceError !== "" && (
        <p className="pb-2 text-sm font-light text-rose-400" role="alert">
          {voiceError}
        </p>
      )}

      <ComposerPanel />

      <div
        className={
          panelOpen
            ? "rounded-3xl rounded-t-none border border-t-0 border-zinc-700 bg-zinc-900 shadow-xl"
            : "rounded-3xl border border-zinc-700 bg-zinc-900 shadow-xl"
        }
      >
        <textarea
          className="max-h-50 w-full resize-none bg-transparent px-4 pt-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          disabled={voiceActive}
          onChange={(event) => {
            setDraft(event.target.value);
            autoresize();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          placeholder={placeholder}
          ref={textareaRef}
          rows={1}
          value={draft}
        />

        {composerImages.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-4 pt-2">
            {composerImages.map((image) => {
              return (
                <div className="relative" key={image.id}>
                  <img
                    alt={image.name}
                    className="size-14 rounded-lg object-cover"
                    src={image.previewUrl}
                  />

                  <button
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-700 p-0.5 text-zinc-200 hover:bg-zinc-600"
                    onClick={() => removeImage(image.id)}
                    title="Remove image"
                    type="button"
                  >
                    <XMarkIcon className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="flex items-center justify-between px-3 pb-3 pt-2">
          <div className="flex items-center gap-1">
            <button
              className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              onClick={() => fileRef.current?.click()}
              title="Attach images"
              type="button"
            >
              <PaperClipIcon className="size-4" />
            </button>

            <input
              accept="image/*"
              className="hidden"
              multiple
              onChange={(event) => handleFiles(event.target.files)}
              ref={fileRef}
              type="file"
            />

            <ModelPicker />

            <EffortPicker />
          </div>

          <div className="flex items-center gap-1">
            <PermissionPicker />

            <button
              className={
                voicePhase === "listening"
                  ? "rounded-full p-2 text-red-400 hover:bg-zinc-800 hover:text-red-300"
                  : "rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }
              onClick={() => {
                if (voiceActive) {
                  void stopVoice();
                } else {
                  void startVoice();
                }
              }}
              title={
                voicePhase === "listening" ? "Stop dictation" : "Voice input"
              }
              type="button"
            >
              {voicePhase === "listening" ? (
                <StopIcon aria-hidden="true" className="size-4" />
              ) : voiceActive ? (
                <LoadingSpinner />
              ) : (
                <MicrophoneIcon className="size-4" />
              )}
            </button>

            {showStop ? (
              <button
                className="grid place-items-center rounded-full bg-red-600 p-2 text-white transition hover:bg-red-500"
                onClick={() => cancelTurn()}
                title="Stop"
                type="button"
              >
                <StopIcon aria-hidden="true" className="size-4" />
              </button>
            ) : (
              <button
                className="grid place-items-center rounded-full bg-zinc-100 p-2 text-zinc-950 transition hover:bg-white disabled:opacity-40 light:hover:bg-zinc-200"
                disabled={!canSend || voicePhase === "stopping"}
                onClick={() => void handleSend()}
                title={sendTitle}
                type="button"
              >
                <ArrowUpIcon className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {micBlocked && (
        <Dialog
          description="veykor can't access your microphone. Allow microphone access in your browser's site settings, then try again."
          onClose={() => setMicBlocked(false)}
          title="Microphone is blocked"
        >
          <div className="flex justify-end">
            <button
              className="cursor-pointer rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white light:hover:bg-zinc-200"
              onClick={() => setMicBlocked(false)}
              type="button"
            >
              Got it
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default ChatComposer;
