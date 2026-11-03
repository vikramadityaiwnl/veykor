import { useState } from "react";
import type { DragEvent } from "react";
import { Bars3Icon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface Props {
  disabled: boolean;
  label: string;
  onChange: (values: Array<string>) => void;
  values: Array<string>;
}

interface DropTarget {
  before: boolean;
  index: number;
}

const fieldClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40";

function ArgumentList(props: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  function isBefore(event: DragEvent<HTMLLIElement>): boolean {
    const rect = event.currentTarget.getBoundingClientRect();

    return event.clientY < rect.top + rect.height / 2;
  }

  function handleDragStart(event: DragEvent<HTMLLIElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));

    setDragIndex(index);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, index: number) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (dragIndex === null || dragIndex === index) {
      setDropTarget(null);
      return;
    }

    setDropTarget({ before: isBefore(event), index });
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, index: number) {
    event.preventDefault();

    if (dragIndex !== null && dragIndex !== index) {
      const next = [...props.values];
      const [moved] = next.splice(dragIndex, 1);
      const target = dragIndex < index ? index - 1 : index;

      next.splice(isBefore(event) ? target : target + 1, 0, moved);
      props.onChange(next);
    }

    setDragIndex(null);
    setDropTarget(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDropTarget(null);
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {props.values.map((value, index) => {
          const dragging = index === dragIndex;
          const showBefore = dropTarget?.index === index && dropTarget.before;
          const showAfter = dropTarget?.index === index && !dropTarget.before;

          return (
            <li
              className={`relative flex cursor-grab items-center gap-1.5 active:cursor-grabbing ${dragging ? "opacity-40" : ""}`}
              draggable={!props.disabled}
              key={index}
              onDragEnd={handleDragEnd}
              onDragOver={(event) => handleDragOver(event, index)}
              onDragStart={(event) => handleDragStart(event, index)}
              onDrop={(event) => handleDrop(event, index)}
            >
              {showBefore && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 -top-1 flex items-center gap-1.5"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-zinc-100" />
                  <span className="h-0.5 flex-1 rounded-full bg-zinc-100" />
                </span>
              )}

              <input
                aria-label={`${props.label} ${index + 1}`}
                className={fieldClass}
                disabled={props.disabled}
                onChange={(event) => {
                  const next = [...props.values];

                  next[index] = event.target.value;
                  props.onChange(next);
                }}
                placeholder={`Argument ${index + 1}`}
                type="text"
                value={value}
              />

              <Bars3Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-zinc-600"
              />

              <button
                aria-label={`Remove argument ${index + 1}`}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={props.disabled}
                onClick={() =>
                  props.onChange(
                    props.values.filter((_, entry) => entry !== index),
                  )
                }
                type="button"
              >
                <XMarkIcon aria-hidden="true" className="size-4" />
              </button>

              {showAfter && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 -bottom-1 flex items-center gap-1.5"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-zinc-100" />
                  <span className="h-0.5 flex-1 rounded-full bg-zinc-100" />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <button
        className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-sm font-light text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={props.disabled}
        onClick={() => props.onChange([...props.values, ""])}
        type="button"
      >
        <PlusIcon aria-hidden="true" className="size-4" />
        Add argument
      </button>
    </div>
  );
}

export default ArgumentList;
