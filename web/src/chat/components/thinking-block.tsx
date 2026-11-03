import { useState } from "react";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  LightBulbIcon,
} from "@heroicons/react/24/outline";
import type { ChatHistoryItem } from "@veykor/shared";

interface Props {
  item: ChatHistoryItem;
}

function ThinkingBlock(props: Props) {
  const [open, setOpen] = useState(() => props.item.status === "inProgress");

  function handleToggle() {
    setOpen((current) => !current);
  }

  const chevronClassName = open
    ? "size-3.5 rotate-180 transition-transform motion-reduce:transition-none"
    : "size-3.5 transition-transform motion-reduce:transition-none";

  return (
    <div className="w-full min-w-0">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs font-light text-zinc-500 hover:text-zinc-300"
        onClick={handleToggle}
        type="button"
      >
        {props.item.status === "inProgress" ? (
          <>
            <ArrowPathIcon
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />

            <span>Thinking…</span>
          </>
        ) : (
          <>
            <LightBulbIcon aria-hidden="true" className="size-4" />

            <span>Thought</span>
          </>
        )}

        <ChevronDownIcon aria-hidden="true" className={chevronClassName} />
      </button>

      {open && (
        <div className="space-y-1 px-1 pb-1">
          {props.item.summary.map((paragraph, index) => (
            <p
              className="text-xs font-light text-zinc-500"
              key={`${props.item.itemId}-${index}`}
            >
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default ThinkingBlock;
