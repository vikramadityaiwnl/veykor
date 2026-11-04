import { useState } from "react";
import type { DragEvent } from "react";
import { Bars3Icon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";

export interface QueueListItem {
  id: string;
  text: string;
  imageCount: number;
}

interface DropTarget {
  before: boolean;
  id: string;
}

interface Props {
  items: Array<QueueListItem>;
  onSteer: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (draggedId: string, targetId: string, before: boolean) => void;
}

function messageLabel(message: QueueListItem): string {
  if (message.text !== "") {
    return message.text;
  }

  if (message.imageCount === 1) {
    return "1 image";
  }

  return `${message.imageCount} images`;
}

function QueueList(props: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  function isBefore(event: DragEvent<HTMLLIElement>): boolean {
    const rect = event.currentTarget.getBoundingClientRect();

    return event.clientY < rect.top + rect.height / 2;
  }

  function handleDragStart(event: DragEvent<HTMLLIElement>, id: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);

    setDragId(id);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, id: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (dragId === null || dragId === id) {
      setDropTarget(null);
      return;
    }

    setDropTarget({ before: isBefore(event), id });
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, id: string) {
    event.preventDefault();

    if (dragId !== null && dragId !== id) {
      props.onReorder(dragId, id, isBefore(event));
    }

    setDragId(null);
    setDropTarget(null);
  }

  function handleDragEnd() {
    setDragId(null);
    setDropTarget(null);
  }

  return (
    <ul className="space-y-1.5 px-4 pb-3">
      {props.items.map((message) => {
        const dragging = message.id === dragId;
        const showBefore = dropTarget?.id === message.id && dropTarget.before;
        const showAfter = dropTarget?.id === message.id && !dropTarget.before;

        return (
          <li
            className={`relative flex cursor-grab items-center gap-1 active:cursor-grabbing ${dragging ? "opacity-40" : ""}`}
            draggable
            key={message.id}
            onDragEnd={handleDragEnd}
            onDragOver={(event) => handleDragOver(event, message.id)}
            onDragStart={(event) => handleDragStart(event, message.id)}
            onDrop={(event) => handleDrop(event, message.id)}
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

            <Bars3Icon
              aria-hidden="true"
              className="size-4 shrink-0 text-zinc-600"
            />

            <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
              {messageLabel(message)}
            </span>

            <button
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-light text-zinc-400 hover:text-zinc-200"
              onClick={() => props.onSteer(message.id)}
              title="Send now"
              type="button"
            >
              Steer
            </button>

            <button
              aria-label="Edit in composer"
              className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              onClick={() => props.onEdit(message.id)}
              title="Edit in composer"
              type="button"
            >
              <PencilIcon aria-hidden="true" className="size-4" />
            </button>

            <button
              aria-label="Delete queued message"
              className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-rose-300"
              onClick={() => props.onDelete(message.id)}
              title="Delete queued message"
              type="button"
            >
              <TrashIcon aria-hidden="true" className="size-4" />
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
  );
}

export default QueueList;
