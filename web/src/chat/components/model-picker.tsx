import { useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import type { ChatModelOption } from "@veykor/shared";
import { modelDisplayName } from "@veykor/shared";
import Popover from "../../components/popover/popover.tsx";
import { useChatStore } from "../chat-store.ts";

function pricingLabel(model: ChatModelOption): string {
  if (model.cost === null) {
    return model.providerId;
  }

  return `$${model.cost.input} / $${model.cost.cached} / $${model.cost.output} · 1M`;
}

function ModelPicker() {
  const modelId = useChatStore((s) => s.modelId);
  const catalog = useChatStore((s) => s.catalog);
  const setModel = useChatStore((s) => s.setModel);

  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const models = catalog?.models ?? [];
  const active = models.find((model) => model.modelId === modelId) ?? null;
  const ready = catalog !== null;

  function handleOpen() {
    const button = buttonRef.current;

    if (button === null || !ready) {
      return;
    }

    const rect = button.getBoundingClientRect();

    setAnchorRect(new DOMRect(rect.left, rect.top, 360, rect.height));
    setOpen(true);
  }

  function handleSelect(model: ChatModelOption) {
    setModel(model.modelId, model.providerId);
    setOpen(false);
  }

  return (
    <>
      <button
        className={
          ready
            ? "flex max-w-44 items-center gap-1 rounded-full px-2 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            : "flex max-w-44 cursor-not-allowed items-center gap-1 rounded-full px-2 py-2 text-xs text-zinc-600 opacity-50"
        }
        disabled={!ready}
        onClick={handleOpen}
        ref={buttonRef}
        title="Select model"
        type="button"
      >
        <span className="truncate">
          {active === null
            ? "Select model"
            : modelDisplayName(active.modelId, active.displayLabel)}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0" />
      </button>

      {open && anchorRect !== null ? (
        <Popover anchorRect={anchorRect} onClose={() => setOpen(false)}>
          <div className="max-h-80 overflow-auto p-1">
            {models.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-zinc-500">
                No models available.
              </p>
            ) : (
              models.map((model) => {
                const selected = model.modelId === modelId;

                return (
                  <button
                    className={
                      selected
                        ? "flex w-full items-start gap-3 rounded-xl bg-zinc-800 p-3 text-left hover:bg-zinc-700"
                        : "flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-zinc-800"
                    }
                    key={`${model.providerId}:${model.modelId}`}
                    onClick={() => handleSelect(model)}
                    type="button"
                  >
                    <CubeIcon className="size-5 shrink-0 text-zinc-400" />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-100">
                        {modelDisplayName(model.modelId, model.displayLabel)}
                      </span>

                      {model.description !== "" ? (
                        <span className="block text-xs text-zinc-500 line-clamp-2">
                          {model.description}
                        </span>
                      ) : null}

                      <span className="block text-[11px] text-zinc-500">
                        {pricingLabel(model)}
                      </span>
                    </span>

                    {selected ? (
                      <CheckIcon className="size-4 shrink-0 self-center text-zinc-300" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </Popover>
      ) : null}
    </>
  );
}

export default ModelPicker;
