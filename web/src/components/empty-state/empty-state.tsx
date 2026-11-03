import { InboxIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

interface Props {
  alignment?: "center" | "start";
  description?: string;
  icon?: ReactNode;
  iconSize?: number;
  title: string;
}

function EmptyState(props: Props) {
  const hasDescription =
    props.description !== undefined && props.description !== "";

  const alignment = props.alignment ?? "center";
  const iconSize = props.iconSize ?? 20;

  const icon = props.icon ?? (
    <InboxIcon
      aria-hidden="true"
      className="text-zinc-500"
      style={{ height: iconSize, width: iconSize }}
    />
  );

  return (
    <div
      className={
        alignment === "center"
          ? hasDescription
            ? "flex flex-col items-center gap-2 px-4 py-6 text-center"
            : "flex flex-col items-center gap-2 px-4 py-4 text-center"
          : hasDescription
            ? "flex w-full flex-1 flex-col items-start gap-2 py-6 text-left"
            : "flex w-full flex-1 flex-col items-start gap-2 py-4 text-left"
      }
    >
      {hasDescription ? (
        <div className="grid place-items-center rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
          {icon}
        </div>
      ) : (
        icon
      )}

      <p
        className={
          hasDescription
            ? "text-sm font-semibold text-zinc-50"
            : "text-xs font-light text-zinc-500"
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
