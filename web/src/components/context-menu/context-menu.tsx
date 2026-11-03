import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { semanticColors } from "../../theme/semantic-colors.ts";

export interface ContextMenuChild {
  icon: ReactNode;
  id: string;
  label: string;
}

export interface ContextMenuItem {
  kind: "item";
  icon: ReactNode;
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  children?: Array<ContextMenuChild>;
}

export interface ContextMenuDivider {
  kind: "divider";
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuDivider;

interface Props {
  items: Array<ContextMenuEntry>;
  onClose: () => void;
  onSelect: (item: ContextMenuItem | ContextMenuChild) => void;
  x: number;
  y: number;
}

const menuWidth = 144;

const flyoutWidth = 144;

const flyoutRowHeight = 28;

const flyoutPadding = 8;

function ContextMenu(props: Props) {
  const onClose = props.onClose;

  const [flyout, setFlyout] = useState<{ id: string; top: number } | null>(
    null,
  );

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

  const flyoutLeft =
    left + menuWidth + 8 + flyoutWidth > window.innerWidth - 8
      ? left - flyoutWidth - 8
      : left + menuWidth + 8;

  const flyoutItem =
    flyout === null
      ? undefined
      : props.items.find(
          (entry): entry is ContextMenuItem =>
            entry.kind === "item" && entry.id === flyout.id,
        );

  function openFlyout(item: ContextMenuItem, anchor: HTMLElement) {
    const count = item.children?.length ?? 0;
    const height = count * flyoutRowHeight + flyoutPadding;
    const rect = anchor.getBoundingClientRect();
    const clamped = Math.min(rect.top, window.innerHeight - height - 8);

    setFlyout({ id: item.id, top: Math.max(clamped, 8) });
  }

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
        {props.items.map((entry, index) => {
          if (entry.kind === "divider") {
            return (
              <div
                key={`divider-${index}`}
                aria-hidden="true"
                className="mx-2 my-1 h-px bg-zinc-800"
              />
            );
          }

          const hasChildren =
            entry.children !== undefined && entry.children.length > 0;

          return (
            <button
              key={entry.id}
              disabled={entry.disabled}
              style={
                entry.disabled
                  ? { opacity: 0.4, cursor: "not-allowed" }
                  : undefined
              }
              aria-expanded={hasChildren ? flyout?.id === entry.id : undefined}
              className={
                entry.danger === true
                  ? `flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-light transition hover:bg-zinc-800 ${semanticColors.delete.text}`
                  : "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-light text-zinc-200 transition hover:bg-zinc-800"
              }
              onClick={(event) => {
                if (!hasChildren) {
                  props.onSelect(entry);
                  return;
                }

                if (flyout?.id === entry.id) {
                  setFlyout(null);
                } else {
                  openFlyout(entry, event.currentTarget);
                }
              }}
              onMouseEnter={(event) => {
                if (hasChildren) {
                  openFlyout(entry, event.currentTarget);
                } else {
                  setFlyout(null);
                }
              }}
              role="menuitem"
              type="button"
            >
              {entry.icon}

              <span className="flex-1 truncate">{entry.label}</span>

              {hasChildren && (
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-3 shrink-0 text-zinc-500"
                />
              )}
            </button>
          );
        })}
      </div>

      {flyoutItem?.children && (
        <div
          className="fixed z-50 w-36 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl"
          role="menu"
          style={{ left: flyoutLeft, top: flyout?.top ?? top }}
        >
          {flyoutItem.children.map((child) => (
            <button
              key={child.id}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-light text-zinc-200 transition hover:bg-zinc-800"
              onClick={() => props.onSelect(child)}
              role="menuitem"
              type="button"
            >
              {child.icon}

              <span className="truncate">{child.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default ContextMenu;
