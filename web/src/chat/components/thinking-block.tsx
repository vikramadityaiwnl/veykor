import { useEffect, useState } from "react";
import Divider from "../../components/divider/divider.tsx";

interface Props {
  durationMs: number;
  running: boolean;
  summaries: Array<string>;
}

function ThinkingBlock(props: Props) {
  const [open, setOpen] = useState(() => props.running);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!props.running) {
      return;
    }

    const started = Date.now();

    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 500);

    return () => {
      window.clearInterval(timer);
    };
  }, [props.running]);

  const nativeSeconds =
    props.durationMs > 0 ? Math.round(props.durationMs / 1000) : 0;

  const spent = nativeSeconds > 0 ? nativeSeconds : elapsed;

  const title = props.running
    ? `Thinking for ${elapsed} ${elapsed === 1 ? "second" : "seconds"}`
    : spent > 0
      ? `Thought for ${spent} ${spent === 1 ? "second" : "seconds"}`
      : "Thought";

  return (
    <div className="w-full min-w-0">
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

      {props.summaries.length > 0 ? (
        <div
          className={
            open
              ? "grid grid-rows-[1fr] opacity-100 transition-all duration-300 ease-in-out motion-reduce:transition-none"
              : "grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-in-out motion-reduce:transition-none"
          }
        >
          <div className="overflow-hidden">
            <div className="space-y-1.5 pb-2 pt-1">
              {props.summaries.map((paragraph, index) => (
                <p
                  className="text-xs font-light text-zinc-500"
                  key={`${index}-${paragraph.length}`}
                >
                  {paragraph}
                </p>
              ))}
            </div>
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
