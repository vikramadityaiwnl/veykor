import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useChatStore } from "../chat-store.ts";

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

function LivePreviewPip() {
  const preview = useChatStore((state) => state.livePreview);
  const agentWorking = useChatStore((state) => state.streaming);
  const dismiss = useChatStore((state) => state.dismissLivePreview);
  const [orientation, setOrientation] = useState<{
    itemId: string;
    portrait: boolean;
  } | null>(null);
  const [position, setPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  if (!preview) {
    return null;
  }

  const portrait =
    orientation?.itemId === preview.itemId && orientation.portrait;

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    const box = boxRef.current;

    if (!box) {
      return;
    }

    const rect = box.getBoundingClientRect();

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const box = boxRef.current;

    if (!drag || !box) {
      return;
    }

    const rect = box.getBoundingClientRect();
    const margin = 8;

    setPosition({
      x: Math.min(
        Math.max(drag.originX + event.clientX - drag.startX, margin),
        Math.max(window.innerWidth - rect.width - margin, margin),
      ),
      y: Math.min(
        Math.max(drag.originY + event.clientY - drag.startY, margin),
        Math.max(window.innerHeight - rect.height - margin, margin),
      ),
    });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  return (
    <div
      ref={boxRef}
      className={`fixed z-30 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl ${position ? "" : "bottom-44 right-6"}`}
      style={position ? { left: position.x, top: position.y } : undefined}
    >
      <div
        className="flex h-8 cursor-move touch-none items-center gap-2 bg-zinc-900 px-3"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${agentWorking || preview.active ? "animate-pulse bg-emerald-400 motion-reduce:animate-none" : "bg-zinc-500"}`}
        />

        <span className="min-w-0 flex-1 truncate text-xs font-light text-zinc-300">
          Live preview
        </span>

        <button
          aria-label="Dismiss preview"
          className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
          onClick={dismiss}
          type="button"
        >
          <XMarkIcon aria-hidden="true" className="size-3.5" />
        </button>
      </div>

      <img
        key={preview.itemId}
        alt="Live browser preview"
        className={`block object-contain ${portrait ? "h-80 w-auto max-w-[80vw]" : "max-h-[70vh] w-80"}`}
        draggable={false}
        src={`data:${preview.mediaType};base64,${preview.base64Data}`}
        onLoad={(event) => {
          const image = event.currentTarget;

          setOrientation({
            itemId: preview.itemId,
            portrait: image.naturalHeight > image.naturalWidth,
          });
        }}
      />
    </div>
  );
}

export default LivePreviewPip;
