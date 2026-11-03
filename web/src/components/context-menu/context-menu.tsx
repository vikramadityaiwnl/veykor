import { useEffect } from "react";
import type { ReactNode } from "react";

export interface ContextMenuItem {
  icon: ReactNode;
  id: string;
  label: string;
}

interface Props {
  items: Array<ContextMenuItem>;
  onClose: () => void;
  onSelect: (item: ContextMenuItem) => void;
  x: number;
  y: number;
}

function ContextMenu(props: Props) {
  const onClose = props.onClose;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const left = Math.min(props.x, window.innerWidth - 160);
  const top = Math.min(props.y, window.innerHeight - 110);

  return (
    <>
      <button
        aria-label="Close menu"
        className="fixed inset-0 z-40 cursor-default"
        onClick={props.onClose}
        type="button"
      />

      <div
        className="fixed z-50 w-36 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl"
        role="menu"
        style={{ left, top }}
      >
        {props.items.map((item) => (
          <button
            key={item.id}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-light text-zinc-200 transition hover:bg-zinc-800"
            onClick={() => props.onSelect(item)}
            role="menuitem"
            type="button"
          >
            {item.icon}

            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export default ContextMenu;
