import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Divider from "../../components/divider/divider.tsx";

interface Props {
  durationMs: number;
  hideByDefault: boolean;
  running: boolean;
  startedAt: number;
  children?: ReactNode;
}

function ThinkingBlock(props: Props) {
  const [open, setOpen] = useState(props.running && !props.hideByDefault);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    setOpen(props.running && !props.hideByDefault);
  }, [props.hideByDefault, props.running]);

  useEffect(() => {
    if (!props.running) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 500);

    return () => {
      window.clearInterval(timer);
    };
  }, [props.running]);

  const elapsed =
    props.startedAt > 0
      ? Math.max(0, Math.floor((now - props.startedAt) / 1000))
      : 0;

  const nativeSeconds =
    props.durationMs > 0 ? Math.round(props.durationMs / 1000) : 0;

  const spent = nativeSeconds;

  const title = props.running
    ? `Thinking for ${elapsed} ${elapsed === 1 ? "second" : "seconds"}`
    : spent > 0
      ? `Thought for ${spent} ${spent === 1 ? "second" : "seconds"}`
      : "Thought";
  const hasContent = props.children !== undefined && props.children !== null;

  return (
    <div className="w-full min-w-0">
      {hasContent ? (
        <button
          aria-expanded={open}
          className="rounded-lg py-1.5 text-left text-sm font-light text-zinc-500 hover:text-zinc-300"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {props.running ? (
            <span className="animate-shimmer">{title}</span>
          ) : (
            <span>{title}</span>
          )}
        </button>
      ) : (
        <p className="py-1.5 text-sm font-light text-zinc-500">
          {props.running ? (
            <span className="animate-shimmer">{title}</span>
          ) : (
            <span>{title}</span>
          )}
        </p>
      )}

      {hasContent ? (
        <div
          className={
            open
              ? "grid grid-rows-[1fr] opacity-100 transition-all duration-300 ease-in-out motion-reduce:transition-none"
              : "grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-in-out motion-reduce:transition-none"
          }
        >
          <div className="overflow-hidden">
            <div className="space-y-3 pb-2 pt-1">{props.children}</div>
          </div>
        </div>
      ) : null}

      <div className="pt-1">
        <Divider />
      </div>
    </div>
  );
}

export default ThinkingBlock;
