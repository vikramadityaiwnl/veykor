import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  title: string;
  size?: "default" | "wide";
}

function Dialog(props: Props) {
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

  return createPortal(
    <div
      aria-label={props.title}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
    >
      <button
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={props.onClose}
        type="button"
      />

      <div
        className={`relative w-full space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 text-left ${props.size === "wide" ? "max-w-2xl p-6" : "max-w-sm p-4"}`}
      >
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-zinc-50">{props.title}</h2>

          {props.description !== undefined && props.description !== "" && (
            <p className="text-sm font-light text-zinc-400">
              {props.description}
            </p>
          )}
        </div>

        {props.children}
      </div>
    </div>,
    document.body,
  );
}

export default Dialog;
