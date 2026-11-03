import { InboxIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

interface Props {
  description?: string;
  icon?: ReactNode;
  title: string;
}

function EmptyState(props: Props) {
  const hasDescription =
    props.description !== undefined && props.description !== "";

  const icon = props.icon ?? (
    <InboxIcon aria-hidden="true" className="size-5 text-zinc-500" />
  );

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
      {hasDescription ? (
        <div className="grid size-10 place-items-center rounded-lg border border-zinc-800 bg-zinc-900">
          {icon}
        </div>
      ) : (
        icon
      )}

      <p
        className={
          hasDescription
            ? "text-sm font-semibold text-zinc-50"
            : "text-sm font-semibold text-zinc-500"
        }
      >
        {props.title}
      </p>

      {hasDescription && (
        <p className="text-xs font-light text-zinc-500">{props.description}</p>
      )}
    </div>
  );
}

export default EmptyState;
