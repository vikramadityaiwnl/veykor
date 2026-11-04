import { useState } from "react";
import { ChevronDownIcon, WrenchIcon } from "@heroicons/react/24/outline";
import type { ChatHistoryItem } from "@veykor/shared";
import { extractFilePathCandidates } from "@veykor/shared";
import type { LivePreview } from "../chat-store.ts";
import FileReferenceText from "./file-reference-text.tsx";

interface Props {
  chatId: string;
  item: ChatHistoryItem;
  preview?: LivePreview | null;
  previewSrc?: string;
}

function ToolCallBlock(props: Props) {
  const [open, setOpen] = useState(false);
  const [failedPreviewSrc, setFailedPreviewSrc] = useState("");

  function handleToggle() {
    setOpen((current) => !current);
  }

  let name = "Tool call";

  if (props.item.displayLabel !== "") {
    name = props.item.displayLabel;
  } else if (props.item.tool !== "") {
    name = props.item.tool;
  }

  let dotClassName = "size-1.5 shrink-0 rounded-full bg-zinc-600";

  if (props.item.status === "inProgress") {
    dotClassName =
      "size-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse motion-reduce:animate-none";
  } else if (props.item.status === "completed") {
    dotClassName = "size-1.5 shrink-0 rounded-full bg-emerald-400";
  }

  const buttonClassName = open
    ? "flex w-full cursor-pointer items-center gap-2.5 rounded-t-xl border border-b-0 border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-left hover:border-zinc-700"
    : "flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-left hover:border-zinc-700";

  const chevronClassName = open
    ? "size-4 shrink-0 rotate-180 text-zinc-500 transition-transform duration-300 ease-in-out motion-reduce:transition-none"
    : "size-4 shrink-0 text-zinc-500 transition-transform duration-300 ease-in-out motion-reduce:transition-none";
  const previewSrc = props.preview
    ? `data:${props.preview.mediaType};base64,${props.preview.base64Data}`
    : (props.previewSrc ?? "");
  const filePaths = extractFilePathCandidates(
    props.item.args,
    props.item.visibleOutput,
  );

  return (
    <div className="w-full min-w-0">
      <button
        aria-expanded={open}
        className={buttonClassName}
        onClick={handleToggle}
        type="button"
      >
        <span aria-hidden="true" className={dotClassName} />
        <WrenchIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-zinc-500"
        />
        <span className="flex-1 truncate text-[13px] font-light text-zinc-300">
          {name}
        </span>
        <ChevronDownIcon aria-hidden="true" className={chevronClassName} />
      </button>

      <div
        className={
          open
            ? "grid grid-rows-[1fr] opacity-100 transition-all duration-300 ease-in-out motion-reduce:transition-none"
            : "grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-in-out motion-reduce:transition-none"
        }
      >
        <div className="overflow-hidden">
          <div className="space-y-2 rounded-b-xl border border-t-0 border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
            {open && previewSrc !== "" && previewSrc !== failedPreviewSrc && (
              <img
                alt="Image preview from this tool"
                className="max-h-[32rem] w-full rounded-lg object-contain"
                onError={() => setFailedPreviewSrc(previewSrc)}
                src={previewSrc}
              />
            )}

            {props.item.args !== "" && (
              <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-950 p-2 font-mono text-xs font-light whitespace-pre-wrap break-words text-zinc-500">
                <FileReferenceText
                  chatId={props.chatId}
                  filePaths={filePaths}
                  itemId={props.item.itemId}
                  text={props.item.args}
                />
              </pre>
            )}

            {props.item.visibleOutput !== "" && (
              <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-950 p-2 font-mono text-xs font-light whitespace-pre-wrap break-words text-zinc-400">
                <FileReferenceText
                  chatId={props.chatId}
                  filePaths={filePaths}
                  itemId={props.item.itemId}
                  text={props.item.visibleOutput}
                />
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ToolCallBlock;
