import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useChatStore } from "../chat-store.ts";

interface PreviewPosition {
  x: number;
  y: number;
}

interface PreviewImageSize {
  itemId: string;
  ratio: number;
  width: number;
}

interface SavedPreviewLayout {
  position: PreviewPosition | null;
  width: number | null;
}

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface ResizeState {
  startX: number;
  startY: number;
  startWidth: number;
  ratio: number;
  itemId: string;
}

const previewLayoutKey = "veykor:live-preview-layout";
const defaultPreviewWidth = 320;
const minimumPreviewWidth = 160;
const previewHeaderHeight = 32;
const previewMargin = 8;

function readSavedLayout(): SavedPreviewLayout {
  try {
    const value = window.localStorage.getItem(previewLayoutKey);
    const layout = value
      ? (JSON.parse(value) as Partial<SavedPreviewLayout>)
      : {};
    const position = layout.position;

    return {
      position:
        position && Number.isFinite(position.x) && Number.isFinite(position.y)
          ? { x: position.x, y: position.y }
          : null,
      width:
        typeof layout.width === "number" && Number.isFinite(layout.width)
          ? layout.width
          : null,
    };
  } catch {
    return { position: null, width: null };
  }
}

function saveLayout(layout: SavedPreviewLayout): void {
  try {
    window.localStorage.setItem(previewLayoutKey, JSON.stringify(layout));
  } catch {
    return;
  }
}

function clampPosition(
  position: PreviewPosition,
  width: number,
  height: number,
): PreviewPosition {
  return {
    x: Math.min(
      Math.max(position.x, previewMargin),
      Math.max(window.innerWidth - width - previewMargin, previewMargin),
    ),
    y: Math.min(
      Math.max(position.y, previewMargin),
      Math.max(window.innerHeight - height - previewMargin, previewMargin),
    ),
  };
}

function LivePreviewPip() {
  const preview = useChatStore((state) => state.livePreview);
  const agentWorking = useChatStore((state) => state.streaming);
  const dismiss = useChatStore((state) => state.dismissLivePreview);
  const [savedLayout] = useState(readSavedLayout);
  const [position, setPosition] = useState<PreviewPosition | null>(
    savedLayout.position,
  );
  const [imageSize, setImageSize] = useState<PreviewImageSize | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const pendingPositionRef = useRef<PreviewPosition | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const positionRef = useRef(position);
  const imageSizeRef = useRef(imageSize);

  positionRef.current = position;
  imageSizeRef.current = imageSize;

  useEffect(() => {
    function handleWindowResize() {
      const currentPosition = positionRef.current;
      const currentSize = imageSizeRef.current;

      if (currentSize === null) {
        return;
      }

      const maximumWidth = Math.min(
        window.innerWidth * 0.8,
        window.innerHeight * 0.7 * currentSize.ratio,
      );
      const width = Math.min(currentSize.width, maximumWidth);
      const nextSize = { ...currentSize, width };
      imageSizeRef.current = nextSize;
      setImageSize(nextSize);

      if (currentPosition === null) {
        saveLayout({ position: null, width });
        return;
      }

      const height = width / currentSize.ratio + previewHeaderHeight;
      const nextPosition = clampPosition(currentPosition, width, height);

      positionRef.current = nextPosition;
      setPosition(nextPosition);
      saveLayout({
        position: nextPosition,
        width,
      });
    }

    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  if (!preview) {
    return null;
  }

  const previewItemId = preview.itemId;
  const currentImageSize =
    imageSize?.itemId === previewItemId ? imageSize : null;
  const previewWidth =
    imageSize?.width ?? savedLayout.width ?? defaultPreviewWidth;

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
    const nextPosition = clampPosition(
      {
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      },
      rect.width,
      rect.height,
    );

    pendingPositionRef.current = nextPosition;
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }

  function handlePointerUp() {
    dragRef.current = null;

    if (pendingPositionRef.current !== null) {
      saveLayout({
        position: pendingPositionRef.current,
        width: imageSizeRef.current?.width ?? savedLayout.width,
      });
      pendingPositionRef.current = null;
    }
  }

  function handleResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const size = imageSizeRef.current;

    if (!size || size.itemId !== previewItemId) {
      return;
    }

    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      ratio: size.ratio,
      itemId: size.itemId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleResizePointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const resize = resizeRef.current;

    if (!resize) {
      return;
    }

    const dragWidth = Math.max(
      event.clientX - resize.startX,
      (event.clientY - resize.startY) * resize.ratio,
    );
    const maximumWidth = Math.min(
      window.innerWidth * 0.8,
      window.innerHeight * 0.7 * resize.ratio,
    );
    const minimumWidth = Math.min(minimumPreviewWidth, maximumWidth);
    const nextWidth = Math.min(
      Math.max(resize.startWidth + dragWidth, minimumWidth),
      maximumWidth,
    );
    const nextSize = {
      itemId: resize.itemId,
      ratio: resize.ratio,
      width: nextWidth,
    };

    pendingWidthRef.current = nextWidth;
    imageSizeRef.current = nextSize;
    setImageSize(nextSize);

    const currentPosition = positionRef.current;

    if (currentPosition !== null) {
      const nextPosition = clampPosition(
        currentPosition,
        nextWidth,
        nextWidth / resize.ratio + previewHeaderHeight,
      );

      pendingPositionRef.current = nextPosition;
      positionRef.current = nextPosition;
      setPosition(nextPosition);
    }
  }

  function handleResizePointerUp() {
    resizeRef.current = null;

    if (pendingWidthRef.current !== null) {
      const nextPosition = pendingPositionRef.current ?? positionRef.current;
      saveLayout({
        position: nextPosition,
        width: pendingWidthRef.current,
      });
      pendingWidthRef.current = null;
      pendingPositionRef.current = null;
    }
  }

  return (
    <div
      ref={boxRef}
      className={
        "fixed z-30 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl " +
        (position ? "" : "bottom-44 right-6")
      }
      style={{
        ...(position ? { left: position.x, top: position.y } : {}),
        width: previewWidth,
      }}
    >
      <div
        className="flex h-8 cursor-move touch-none items-center gap-2 bg-zinc-900 px-3"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span
          aria-hidden="true"
          className={
            "size-1.5 shrink-0 rounded-full " +
            (agentWorking || preview.active
              ? "animate-pulse bg-emerald-400 motion-reduce:animate-none"
              : "bg-zinc-500")
          }
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
        alt="Live tool image preview"
        className="block h-auto max-h-[70vh] w-full object-contain"
        draggable={false}
        src={"data:" + preview.mediaType + ";base64," + preview.base64Data}
        onLoad={(event) => {
          const image = event.currentTarget;
          const ratio = image.naturalWidth / image.naturalHeight;
          const maximumWidth = Math.min(
            window.innerWidth * 0.8,
            window.innerHeight * 0.7 * ratio,
          );
          const defaultWidth =
            ratio < 1
              ? Math.min(320 * ratio, window.innerWidth * 0.8)
              : defaultPreviewWidth;
          const width = Math.min(
            imageSizeRef.current?.width ?? savedLayout.width ?? defaultWidth,
            maximumWidth,
          );
          const nextSize = { itemId: previewItemId, ratio, width };

          imageSizeRef.current = nextSize;
          setImageSize(nextSize);

          const currentPosition = positionRef.current;

          if (currentPosition !== null) {
            const nextPosition = clampPosition(
              currentPosition,
              width,
              width / ratio + previewHeaderHeight,
            );

            positionRef.current = nextPosition;
            setPosition(nextPosition);
            saveLayout({ position: nextPosition, width });
          } else if (savedLayout.width !== width) {
            saveLayout({ position: null, width });
          }
        }}
      />

      {currentImageSize && (
        <button
          aria-label="Resize preview"
          className="absolute bottom-0 right-0 grid size-6 cursor-nwse-resize place-items-center rounded-tl-md bg-zinc-900/85 text-zinc-300 hover:bg-zinc-800"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          type="button"
        >
          <span
            aria-hidden="true"
            className="size-2.5 border-r-2 border-b-2 border-current"
          />
        </button>
      )}
    </div>
  );
}

export default LivePreviewPip;
