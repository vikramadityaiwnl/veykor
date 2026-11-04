import type { ReactNode } from "react";

export interface TabOption<T extends string> {
  icon?: ReactNode;
  label: string;
  value: T;
}

interface Props<T extends string> {
  label: string;
  onChange: (value: T) => void;
  options: Array<TabOption<T>>;
  value: T;
}

function Tabs<T extends string>(props: Props<T>) {
  return (
    <div
      aria-label={props.label}
      className="flex gap-6 border-b border-zinc-800"
      role="tablist"
    >
      {props.options.map((option) => {
        const active = option.value === props.value;

        return (
          <button
            key={option.value}
            aria-selected={active}
            className={`-mb-px flex items-center gap-2 border-b-2 pb-3 text-sm transition ${
              active
                ? "border-zinc-50 font-semibold text-zinc-50"
                : "border-transparent font-light text-zinc-500 hover:text-zinc-300"
            }`}
            onClick={() => props.onChange(option.value)}
            role="tab"
            type="button"
          >
            {option.icon}

            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
