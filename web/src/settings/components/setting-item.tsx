import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  description: string;
  title: string;
}

function SettingItem(props: Props) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-zinc-100">{props.title}</p>

        <p className="text-sm font-light text-zinc-400">{props.description}</p>
      </div>

      <div className="shrink-0">{props.children}</div>
    </div>
  );
}

export default SettingItem;
