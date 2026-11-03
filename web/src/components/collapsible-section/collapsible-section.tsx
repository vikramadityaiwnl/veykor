import { ChevronDownIcon } from "@heroicons/react/24/solid";
import type { MouseEvent, ReactNode } from "react";

interface Props {
  action?: ReactNode;
  active?: boolean;
  children: ReactNode;
  onTitleContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
  open: boolean;
  title: string;
}

function CollapsibleSection(props: Props) {
  return (
    <section className="group/section">
      <div className="group/header relative flex items-center">
        <button
          aria-expanded={props.open}
          className={
            props.active === true
              ? "flex flex-1 items-center gap-1.5 rounded-md px-1 py-1 pr-8 text-sm font-semibold text-zinc-200 transition hover:text-zinc-50"
              : "flex flex-1 items-center gap-1.5 rounded-md px-1 py-1 pr-8 text-sm font-semibold text-zinc-500 transition hover:text-zinc-50"
          }
          onClick={props.onToggle}
          onContextMenu={props.onTitleContextMenu}
          type="button"
        >
          <span className="truncate">{props.title}</span>

          <ChevronDownIcon
            aria-hidden="true"
            className={
              props.open
                ? "size-4 shrink-0 transition-transform duration-300"
                : "size-4 shrink-0 -rotate-90 transition-transform duration-300"
            }
          />
        </button>

        <div className="absolute right-0">{props.action}</div>
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
