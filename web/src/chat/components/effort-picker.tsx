import { useRef, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import Popover from "../../components/popover/popover.tsx";
import { useChatStore } from "../chat-store.ts";

const fallbackEfforts = ["minimal", "low", "medium", "high", "xhigh", "max"];

function EffortPicker() {
  const modelId = useChatStore((s) => s.modelId);
  const catalog = useChatStore((s) => s.catalog);
  const reasoningEffort = useChatStore((s) => s.reasoningEffort);
  const setReasoningEffort = useChatStore((s) => s.setReasoningEffort);

  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const active =
    (catalog?.models ?? []).find((model) => model.modelId === modelId) ?? null;
  const options =
    active !== null && active.variants.length > 0
      ? active.variants
      : fallbackEfforts;
  const ready = catalog !== null;

  function handleOpen() {
    const button = buttonRef.current;

    if (button === null || !ready) {
      return;
    }

    const rect = button.getBoundingClientRect();

    setAnchorRect(new DOMRect(rect.left, rect.top, 240, rect.height));
    setOpen(true);
  }

  function handleSelect(value: string) {
    setReasoningEffort(value);
    setOpen(false);
  }

  return (
    <>
      <button
        className={
          ready
            ? "flex items-center gap-1 rounded-full px-2 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            : "flex cursor-not-allowed items-center gap-1 rounded-full px-2 py-2 text-xs text-zinc-600 opacity-50"
        }
        disabled={!ready}
        onClick={handleOpen}
        ref={buttonRef}
        title="Thinking effort"
        type="button"
      >
        <AdjustmentsHorizontalIcon className="size-4 shrink-0" />
        <span>{reasoningEffort === "" ? "Auto" : reasoningEffort}</span>
      </button>

      {open && anchorRect !== null ? (
        <Popover anchorRect={anchorRect} onClose={() => setOpen(false)}>
          <p className="px-3 pb-1 pt-2 text-xs font-medium text-zinc-500">
            Thinking effort
          </p>

          <div className="p-1">
            <button
              className={
                reasoningEffort === ""
                  ? "flex w-full items-center justify-between rounded-lg bg-zinc-800 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700"
                  : "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
              }
              onClick={() => handleSelect("")}
              type="button"
            >
              <span>Auto</span>

              {reasoningEffort === "" ? (
                <CheckIcon className="size-4 text-zinc-300" />
              ) : null}
            </button>

            {options.map((option) => {
              const selected = reasoningEffort === option;

              return (
                <button
                  className={
                    selected
                      ? "flex w-full items-center justify-between rounded-lg bg-zinc-800 px-3 py-2 text-left text-sm capitalize text-zinc-200 hover:bg-zinc-700"
                      : "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm capitalize text-zinc-200 hover:bg-zinc-800"
                  }
                  key={option}
                  onClick={() => handleSelect(option)}
                  type="button"
                >
                  <span>{option}</span>

                  {selected ? (
                    <CheckIcon className="size-4 text-zinc-300" />
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

export default EffortPicker;
