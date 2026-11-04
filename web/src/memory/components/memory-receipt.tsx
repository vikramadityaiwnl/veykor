import { useState } from "react";
import { useNavigate } from "react-router";
import type { MemoryReceipt as MemoryReceiptData } from "@veykor/shared";
import { undoMemory } from "../memory-client.ts";

interface Props {
  onDismiss: (memoryId: string) => void;
  receipt: MemoryReceiptData;
}

function MemoryReceipt(props: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleUndo() {
    setBusy(true);
    setError("");

    try {
      if (props.receipt.action === "saved") {
        await undoMemory(props.receipt.memoryId, {
          expectedUpdatedAt: props.receipt.updatedAt,
        });
      } else {
        await undoMemory(props.receipt.memoryId, {
          expectedUpdatedAt: props.receipt.updatedAt,
          previousInstruction: props.receipt.previousInstruction,
          previousScope: props.receipt.previousScope,
          previousProjectId: props.receipt.previousProjectId,
        });
      }

      props.onDismiss(props.receipt.memoryId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to undo.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm">
      <p className="min-w-0 flex-1 truncate font-light text-zinc-300">
        Saved {props.receipt.scope} memory
      </p>

      {error !== "" && (
        <span className="text-xs font-light text-rose-400" role="alert">
          {error}
        </span>
      )}

      <button
        className="text-xs font-semibold text-zinc-400 hover:text-zinc-100"
        onClick={() => navigate(`/memory?edit=${props.receipt.memoryId}`)}
        type="button"
      >
        Edit
      </button>

      {props.receipt.reversible && (
        <button
          className="text-xs font-semibold text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
          disabled={busy}
          onClick={() => void handleUndo()}
          type="button"
        >
          {busy ? "Undoing…" : "Undo"}
        </button>
      )}

      <button
        aria-label="Dismiss memory receipt"
        className="text-xs font-semibold text-zinc-500 hover:text-zinc-300"
        onClick={() => props.onDismiss(props.receipt.memoryId)}
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
}

export default MemoryReceipt;
