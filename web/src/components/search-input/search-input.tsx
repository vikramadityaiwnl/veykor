import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { RefObject } from "react";

interface Props {
  commandLabel: string;
  inputRef: RefObject<HTMLInputElement | null>;
  keyLabel: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

function SearchInput(props: Props) {
  return (
    <div className="relative">
      <MagnifyingGlassIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
      />

      <input
        ref={props.inputRef}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-10 pr-16 text-sm font-light text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
        id="sidebar-search"
        name="sidebar-search"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        type="search"
        value={props.value}
      />

      <kbd className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-semibold text-zinc-400">
        <span className="text-sm leading-none">{props.commandLabel}</span>

        <span className="text-xs leading-none">{props.keyLabel}</span>
      </kbd>
    </div>
  );
}

export default SearchInput;
