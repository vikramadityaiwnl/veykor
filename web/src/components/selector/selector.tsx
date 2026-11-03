import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import Popover from "../popover/popover.tsx";

interface Props {
  label: string;
  variant?: "form" | "composer";
  menuWidth?: number;
  placeholder?: string;
  value: string;
  options: {
    value: string;
    label: string;
    description?: string;
    icon?: ReactNode;
    danger?: boolean;
  }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

function Selector(props: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const composer = props.variant === "composer";
  const selected = props.options.find((option) => option.value === props.value);

  return (
    <div className="min-w-0">
      <button
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={anchorRect !== null}
        disabled={props.disabled}
        ref={buttonRef}
        type="button"
        className={`flex items-center text-left font-light transition disabled:opacity-40 disabled:cursor-not-allowed ${composer ? "max-w-48 gap-1.5 rounded-full border border-transparent px-2 py-2 text-sm" : "w-full gap-3 rounded-lg border px-3 py-2 text-sm"} ${selected?.danger ? "border-red-900 text-red-400 enabled:hover:bg-red-950/30" : composer ? "text-zinc-400 enabled:hover:bg-zinc-800 enabled:hover:text-zinc-200" : "border-zinc-700 text-zinc-200 enabled:hover:bg-zinc-800"}`}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();

          if (rect) {
            setAnchorRect(
              new DOMRect(
                rect.left,
                rect.top,
                props.menuWidth ?? Math.max(rect.width, 240),
                rect.height,
              ),
            );
          }
        }}
      >
        {selected?.icon}
        <span className="min-w-0 flex-1 truncate">
          {selected?.label ?? props.placeholder ?? "Choose an option"}
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 ${selected?.danger ? "text-red-400" : "text-zinc-500"}`}
        />
      </button>
      {anchorRect && (
        <Popover anchorRect={anchorRect} onClose={() => setAnchorRect(null)}>
          <div className="max-h-64 overflow-y-auto">
            {props.options.map((option) => (
              <button
                key={option.value}
                role="menuitemradio"
                aria-checked={option.value === props.value}
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${option.value === props.value ? "bg-zinc-800 " : ""}${option.danger ? "text-red-400 hover:bg-red-950/30" : "hover:bg-zinc-800"}`}
                onClick={() => {
                  props.onChange(option.value);
                  setAnchorRect(null);
                  buttonRef.current?.focus();
                }}
              >
                {option.icon}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-light ${option.danger ? "text-red-400" : "text-zinc-100"}`}
                  >
                    {option.label}
                  </span>
                  {option.description && (
                    <span
                      className={`block text-xs font-light ${option.danger ? "text-red-400/80" : "text-zinc-500"}`}
                    >
                      {option.description}
                    </span>
                  )}
                </span>
                {option.value === props.value && (
                  <CheckIcon
                    className={`size-4 shrink-0 ${option.danger ? "text-red-400" : "text-zinc-400"}`}
                  />
                )}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

export default Selector;
