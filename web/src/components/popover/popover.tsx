import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

interface Props {
  anchorRect: DOMRect;
  children: ReactNode;
  onClose: () => void;
}

function Popover(props: Props) {
  const anchorRect = props.anchorRect;
  const onClose = props.onClose;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const width = Math.min(anchorRect.width, window.innerWidth - 16);

  useLayoutEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const gap = 8;
    const height = panel.offsetHeight;
    const spaceBelow = window.innerHeight - anchorRect.bottom;

    const top =
      spaceBelow >= height + gap
        ? anchorRect.bottom + gap
        : anchorRect.top - height - gap;
    const left = Math.min(
      Math.max(anchorRect.left, gap),
      window.innerWidth - width - gap,
    );

    setPosition({ left: Math.max(left, gap), top: Math.max(top, gap) });
  }, [anchorRect, width]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  const style: CSSProperties =
    position === null
      ? {
          left: anchorRect.left,
          top: anchorRect.bottom + 8,
          visibility: "hidden",
          width,
        }
      : { left: position.left, top: position.top, width };

  return (
    <>
      <button
        aria-label="Close menu"
        className="fixed inset-0 z-40 cursor-default"
        onClick={props.onClose}
        type="button"
      />

      <div
        className="fixed z-50 rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 shadow-xl"
        ref={panelRef}
        role="menu"
        style={style}
      >
        {props.children}
      </div>
    </>
  );
}

export default Popover;
