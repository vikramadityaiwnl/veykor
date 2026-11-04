import { useState } from "react";
import { ChevronDownIcon, WrenchIcon } from "@heroicons/react/24/outline";
import { useWorkStore } from "../../work/work-store.ts";
import { useTeamStore } from "../../teams/team-store.ts";
import type { ChatHistoryItem } from "@veykor/shared";
import type { LivePreview } from "../chat-store.ts";

interface Props {
  item: ChatHistoryItem;
  screenshot?: LivePreview | null;
  screenshotSrc?: string;
}

function ToolCallBlock(props: Props) {
  const [open, setOpen] = useState(false);
  const [failedScreenshotSrc, setFailedScreenshotSrc] = useState("");
  const members = useTeamStore((state) => state.snapshot.members);
  const projectId = useWorkStore((state) => state.projectId);
  const member =
    projectId !== "" &&
    props.item.status === "completed" &&
    props.item.tool.includes("team_delegate")
      ? members.find(
          (entry) =>
            !entry.isMain &&
            (props.item.visibleOutput.includes(entry.id) ||
              (entry.agentId !== "" &&
                props.item.visibleOutput.includes(entry.agentId))),
        )
      : undefined;

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
    ? "flex w-full items-center gap-2.5 rounded-t-xl border border-b-0 border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-left"
    : "flex w-full items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-left";

  const chevronClassName = open
    ? "size-4 shrink-0 rotate-180 text-zinc-500 transition-transform duration-300 ease-in-out motion-reduce:transition-none"
    : "size-4 shrink-0 text-zinc-500 transition-transform duration-300 ease-in-out motion-reduce:transition-none";
  const screenshotSrc = props.screenshot
    ? `data:${props.screenshot.mediaType};base64,${props.screenshot.base64Data}`
    : (props.screenshotSrc ?? "");

  return (
    <div className="w-full min-w-0">
      <div className={buttonClassName}>
        <button
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-expanded={member ? undefined : open}
          title={member ? `Open ${member.name}` : undefined}
          onClick={() =>
            member ? useTeamStore.getState().select(member.id) : handleToggle()
          }
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
        </button>
        <button
          aria-label="Toggle tool details"
          aria-expanded={open}
          onClick={handleToggle}
          className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
          type="button"
        >
          <ChevronDownIcon aria-hidden="true" className={chevronClassName} />
        </button>
      </div>

      <div
        className={
          open
            ? "grid grid-rows-[1fr] opacity-100 transition-all duration-300 ease-in-out motion-reduce:transition-none"
            : "grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-in-out motion-reduce:transition-none"
        }
      >
        <div className="overflow-hidden">
          <div className="space-y-2 rounded-b-xl border border-t-0 border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
            {open &&
              screenshotSrc !== "" &&
              screenshotSrc !== failedScreenshotSrc && (
                <img
                  alt="Screenshot captured by this tool"
                  className="max-h-[32rem] w-full rounded-lg object-contain"
                  onError={() => setFailedScreenshotSrc(screenshotSrc)}
                  src={screenshotSrc}
                />
              )}

            {props.item.args !== "" && (
              <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-950 p-2 font-mono text-xs font-light whitespace-pre-wrap break-words text-zinc-500">
                {props.item.args}
              </pre>
            )}

            {props.item.visibleOutput !== "" && (
              <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-950 p-2 font-mono text-xs font-light whitespace-pre-wrap break-words text-zinc-400">
                {props.item.visibleOutput}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ToolCallBlock;
