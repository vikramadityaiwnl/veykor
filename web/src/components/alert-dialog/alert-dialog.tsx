import { semanticColors } from "../../theme/semantic-colors.ts";
import Dialog from "../dialog/dialog.tsx";

interface Props {
  confirmLabel: string;
  danger?: boolean;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
}

function AlertDialog(props: Props) {
  const danger = props.danger ?? true;

  return (
    <Dialog
      description={props.description}
      onClose={props.onClose}
      title={props.title}
    >
      <div className="flex justify-end gap-2">
        <button
          className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800"
          onClick={props.onClose}
          type="button"
        >
          Cancel
        </button>

        <button
          className={
            danger
              ? `cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition ${semanticColors.delete.button}`
              : "cursor-pointer rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white"
          }
          onClick={props.onConfirm}
          type="button"
        >
          {props.confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

export default AlertDialog;
