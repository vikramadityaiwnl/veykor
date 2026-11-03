import { useRef, useState } from "react";
import {
  ArrowUpIcon,
  MicrophoneIcon,
  PaperClipIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StopCircleIcon } from "@heroicons/react/24/solid";
import ComposerPanel from "./composer-panel.tsx";
import EffortPicker from "./effort-picker.tsx";
import ModelPicker from "./model-picker.tsx";
import PermissionPicker from "./permission-picker.tsx";
import { useChatStore } from "../chat-store.ts";

function ChatComposer() {
  const send = useChatStore((s) => s.send);
  const cancelTurn = useChatStore((s) => s.cancelTurn);
  const streaming = useChatStore((s) => s.streaming);
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);
  const todos = useChatStore((s) => s.todos);
  const composerImages = useChatStore((s) => s.composerImages);
  const addImages = useChatStore((s) => s.addImages);
  const removeImage = useChatStore((s) => s.removeImage);

  const [draft, setDraft] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const panelOpen = pendingApprovals.length > 0 || todos.length > 0;
  const canSend = draft.trim() !== "" || composerImages.length > 0;

  function autoresize() {
    const textarea = textareaRef.current;

    if (textarea === null) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }

  function handleSend() {
    if (draft.trim() === "" && composerImages.length === 0) {
      return;
    }

    send(draft);
    setDraft("");

    const textarea = textareaRef.current;

    if (textarea !== null) {
      textarea.style.height = "auto";
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
          onChange={(event) => {
            setDraft(event.target.value);
            autoresize();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask anything…"
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
              className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              onClick={() => {}}
              title="Voice input"
              type="button"
            >
              <MicrophoneIcon className="size-4" />
            </button>

            {streaming ? (
              <button
                className="grid place-items-center rounded-full p-2 text-zinc-100 hover:bg-zinc-800"
                onClick={() => cancelTurn()}
                title="Stop"
                type="button"
              >
                <StopCircleIcon className="size-4" />
              </button>
            ) : (
              <button
                className="grid place-items-center rounded-full bg-zinc-100 p-2 text-zinc-950 hover:bg-white disabled:opacity-40"
                disabled={!canSend}
                onClick={handleSend}
                title="Send"
                type="button"
              >
                <ArrowUpIcon className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatComposer;
