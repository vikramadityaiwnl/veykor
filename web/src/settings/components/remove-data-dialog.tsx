import { useState } from "react";
import Dialog from "../../components/dialog/dialog.tsx";

interface Props {
  error: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

function RemoveDataDialog(props: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    await props.onConfirm();
    setPending(false);
  }

  return (
    <Dialog
      description="This permanently removes your veykor chats, projects, custom agents, integrations, skills, memories, generated images, and saved preferences. Your login and files inside project folders are kept."
      onClose={pending ? () => {} : props.onCancel}
      title="Remove all data?"
    >
      <div className="space-y-3">
        <label className="block space-y-1.5 text-sm font-light text-zinc-300">
          <span>Type REMOVE to confirm.</span>
          <input
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            disabled={pending}
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
        </label>

        {props.error !== "" && (
          <p className="text-sm font-light text-rose-400" role="alert">
            {props.error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending}
          onClick={props.onCancel}
          type="button"
        >
          Cancel
        </button>

        <button
          className="cursor-pointer rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={confirmation !== "REMOVE" || pending}
          onClick={() => void handleConfirm()}
          type="button"
        >
          {pending ? "Removing…" : "Remove all data"}
        </button>
      </div>
    </Dialog>
  );
}

export default RemoveDataDialog;
