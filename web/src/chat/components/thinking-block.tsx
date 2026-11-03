import { useEffect, useState } from "react";
import { ChevronDownIcon, LightBulbIcon } from "@heroicons/react/24/outline";
import type { ChatHistoryItem } from "@veykor/shared";

interface Props {
  item: ChatHistoryItem;
}

function ThinkingBlock(props: Props) {
  const [open, setOpen] = useState(() => props.item.status === "inProgress");
  const [elapsed, setElapsed] = useState(0);

  const running = props.item.status === "inProgress";

  function handleToggle() {
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!running) {
      return;
    }

    const started = Date.now();

    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 500);

    return () => {
      window.clearInterval(timer);
    };
  }, [running, props.item.itemId]);

  const chevronClassName = open
    ? "size-3 rotate-180 transition-transform motion-reduce:transition-none"
    : "size-3 transition-transform motion-reduce:transition-none";

  const title = running
    ? "Thinking…"
    : elapsed > 0
      ? `Thought for ${elapsed}s`
      : "Thought";

  return (
    <div className="w-full min-w-0">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-light text-zinc-500 hover:text-zinc-300"
        onClick={handleToggle}
        type="button"
      >
        <LightBulbIcon aria-hidden="true" className="size-3 shrink-0" />

        {running ? (
          <span className="animate-shimmer">{title}</span>
        ) : (
          <span>{title}</span>
        )}

        <ChevronDownIcon aria-hidden="true" className={chevronClassName} />
      </button>

      {open && props.item.summary.length > 0 ? (
        <div className="space-y-1.5 px-2 pb-2 pt-1">
          {props.item.summary.map((paragraph, index) => (
            <p
              className="text-xs font-light text-zinc-500"
              key={`${props.item.itemId}-${index}`}
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ThinkingBlock;
