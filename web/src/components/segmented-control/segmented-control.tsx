interface SegmentedControlOption<T extends string> {
  label: string;
  value: T;
}

interface Props<T extends string> {
  label: string;
  onChange: (value: T) => void;
  options: Array<SegmentedControlOption<T>>;
  size?: "sm" | "md";
  value: T;
}

function SegmentedControl<T extends string>(props: Props<T>) {
  const size = props.size ?? "md";
  const sizeClass = size === "sm" ? "px-2 py-1 text-xs" : "px-4 py-1.5 text-sm";

  return (
    <div
      aria-label={props.label}
      className="grid gap-1 rounded-lg bg-zinc-800 p-1"
      role="tablist"
      style={{
        gridTemplateColumns: `repeat(${props.options.length}, minmax(0, 1fr))`,
      }}
    >
      {props.options.map((option) => {
        const active = option.value === props.value;

        return (
          <button
            key={option.value}
            aria-selected={active}
            className={
              active
                ? `rounded-md bg-zinc-700 font-semibold text-zinc-50 ${sizeClass}`
                : `rounded-md font-light text-zinc-400 transition hover:text-zinc-200 ${sizeClass}`
            }
            onClick={() => props.onChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
