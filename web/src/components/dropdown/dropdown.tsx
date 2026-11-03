import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import Popover from "../popover/popover.tsx";
import Divider from "../divider/divider.tsx";

export type DropdownEntry =
  | { id: string; kind: "divider" }
  | {
      id: string;
      kind: "item";
      label: string;
      icon?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    };

interface Props {
  label: string;
  trigger: ReactNode;
  items: DropdownEntry[];
  triggerClassName?: string;
}

function Dropdown(props: Props) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  function close() {
    setAnchorRect(null);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (anchorRect === null) {
      return;
    }

    const frame = requestAnimationFrame(() =>
      menuRef.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus(),
    );

    return () => cancelAnimationFrame(frame);
  }, [anchorRect]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length;
      buttons[next]?.focus();
    }

    if (event.key === "Tab") {
      setAnchorRect(null);
    }
  }

  return (
    <div>
      <button
        ref={triggerRef}
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={anchorRect !== null}
        type="button"
        className={
          props.triggerClassName ??
          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-zinc-900"
        }
        onClick={() =>
          setAnchorRect(
            anchorRect === null
              ? (triggerRef.current?.getBoundingClientRect() ?? null)
              : null,
          )
        }
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setAnchorRect(triggerRef.current?.getBoundingClientRect() ?? null);
          }
        }}
      >
        {props.trigger}
      </button>
      {anchorRect && (
        <Popover anchorRect={anchorRect} onClose={close}>
          <div ref={menuRef} onKeyDown={handleKeyDown}>
            {props.items.map((item) =>
              item.kind === "divider" ? (
                <div key={item.id} className="mx-2 my-1">
                  <Divider />
                </div>
              ) : (
                <button
                  key={item.id}
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-light transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 ${item.danger ? "text-red-400" : "text-zinc-200"}`}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ),
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}

export default Dropdown;
