import { ChevronDownIcon } from "@heroicons/react/24/solid";
import type { ReactNode } from "react";

interface Props {
  action?: ReactNode;
  children: ReactNode;
  onToggle: () => void;
  open: boolean;
  title: string;
}

function CollapsibleSection(props: Props) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <button
          aria-expanded={props.open}
          className="flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-semibold text-zinc-200 transition hover:text-zinc-50"
          onClick={props.onToggle}
          type="button"
        >
          <ChevronDownIcon
            aria-hidden="true"
            className={
              props.open
                ? "size-4 text-zinc-500 transition-transform duration-300"
                : "size-4 -rotate-90 text-zinc-500 transition-transform duration-300"
            }
          />

          {props.title}
        </button>

        {props.action}
      </div>

      <div
        className={
          props.open
            ? "grid grid-rows-[1fr] opacity-100 transition-all duration-300 ease-in-out motion-reduce:transition-none"
            : "grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-in-out motion-reduce:transition-none"
        }
      >
        <div className="overflow-hidden">
          <div className="pt-2">{props.children}</div>
        </div>
      </div>
    </section>
  );
}

export default CollapsibleSection;
