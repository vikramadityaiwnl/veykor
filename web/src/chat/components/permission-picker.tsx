import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BoltIcon,
  CheckIcon,
  EyeIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import type { ChatPermission } from "@veykor/shared";
import { chatPermissions } from "@veykor/shared";
import Popover from "../../components/popover/popover.tsx";
import { useChatStore } from "../chat-store.ts";

const permissionIcons: Record<ChatPermission, ReactNode> = {
  "read-only": <EyeIcon className="size-4 text-zinc-400" />,
  approved: <ShieldCheckIcon className="size-4 text-zinc-400" />,
  "full-access": <BoltIcon className="size-4 text-red-400" />,
};

function PermissionPicker() {
  const permission = useChatStore((s) => s.permission);
  const setPermission = useChatStore((s) => s.setPermission);

  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const current =
    chatPermissions.find((entry) => entry.value === permission) ??
    chatPermissions[0];

  function handleOpen() {
    const button = buttonRef.current;

    if (button === null) {
      return;
    }

    const rect = button.getBoundingClientRect();

    setAnchorRect(new DOMRect(rect.left, rect.top, 300, rect.height));
    setOpen(true);
  }

  function handleSelect(value: ChatPermission) {
    setPermission(value);
    setOpen(false);
  }

  return (
    <>
      <button
        className={
          current.value === "full-access"
            ? "flex items-center gap-1.5 rounded-full px-2 py-2 text-xs text-red-400 hover:bg-zinc-800"
            : "flex items-center gap-1.5 rounded-full px-2 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        }
        onClick={handleOpen}
        ref={buttonRef}
        title={current.description}
        type="button"
      >
        {permissionIcons[current.value]}
        <span>{current.title}</span>
      </button>

      {open && anchorRect !== null ? (
        <Popover anchorRect={anchorRect} onClose={() => setOpen(false)}>
          <div className="p-1">
            {chatPermissions.map((entry) => {
              const active = entry.value === permission;
              const danger = entry.value === "full-access";

              return (
                <button
                  className={
                    active
                      ? "flex w-full items-start gap-2.5 rounded-xl bg-zinc-800 px-3 py-2 text-left hover:bg-zinc-700"
                      : "flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-zinc-800"
                  }
                  key={entry.value}
                  onClick={() => handleSelect(entry.value)}
                  type="button"
                >
                  <span className="shrink-0 pt-0.5">
                    {permissionIcons[entry.value]}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        danger
                          ? "block text-[13px] text-red-400"
                          : "block text-[13px] text-zinc-100"
                      }
                    >
                      {entry.title}
                    </span>
                    <span
                      className={
                        danger
                          ? "block text-[11px] text-red-400/80"
                          : "block text-[11px] text-zinc-500"
                      }
                    >
                      {entry.description}
                    </span>
                  </span>

                  {active ? (
                    <CheckIcon className="size-4 shrink-0 self-center text-zinc-300" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </Popover>
      ) : null}
    </>
  );
}

export default PermissionPicker;
