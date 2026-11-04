import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface Props {
  folder: string;
}

function ComposerStatusPanel(props: Props) {
  return (
    <div
      className="rounded-t-3xl border border-b-0 border-zinc-700 bg-danger-soft/60 backdrop-blur-xl"
      role="alert"
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        <ExclamationTriangleIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-danger"
        />

        <p className="text-sm font-semibold text-danger">
          Project folder unavailable
        </p>
      </div>

      <div className="space-y-1 px-4 pb-3">
        <p className="text-xs font-light text-danger-on-soft">
          This project&apos;s folder was moved, renamed, or deleted. You can
          keep reading your chats, but sending and all composer actions are
          disabled until the folder is back.
        </p>

        <p
          className="truncate font-mono text-[11px] font-light text-danger-on-soft opacity-80"
          title={props.folder}
        >
          {props.folder}
        </p>
      </div>
    </div>
  );
}

export default ComposerStatusPanel;
