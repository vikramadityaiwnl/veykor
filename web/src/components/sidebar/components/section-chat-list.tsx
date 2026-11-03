import { useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import { ChatBubbleLeftIcon } from "@heroicons/react/24/outline";
import type { ChatSummary } from "@veykor/shared";
import { themeColors } from "../../../theme/colors.ts";
import EmptyState from "../../empty-state/empty-state.tsx";
import LoadingSpinner from "../../loading-spinner/loading-spinner.tsx";
import { useChatStore } from "../../../chat/chat-store.ts";

interface Props {
  activeChatId: string | null;
  chats: Array<ChatSummary>;
  onChatMenu: (event: MouseEvent<HTMLButtonElement>, chatId: string) => void;
  onOpenChat: (chatId: string) => void;
  searching: boolean;
}

interface DropTarget {
  before: boolean;
  id: string;
}

const visibleLimit = 5;

function SectionChatList(props: Props) {
  const reorderChat = useChatStore((state) => state.reorderChat);
  const finishedChatIds = useChatStore((state) => state.finishedChatIds);

  const [expanded, setExpanded] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const shown =
    props.searching || expanded
      ? props.chats
      : props.chats.slice(0, visibleLimit);

  const hiddenCount = props.chats.length - shown.length;

  function isBefore(event: DragEvent<HTMLLIElement>): boolean {
    const rect = event.currentTarget.getBoundingClientRect();

    return event.clientY < rect.top + rect.height / 2;
  }

  function handleDragStart(event: DragEvent<HTMLLIElement>, chatId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", chatId);

    setDragId(chatId);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, chatId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (dragId === null || dragId === chatId) {
      setDropTarget(null);
      return;
    }

    setDropTarget({ before: isBefore(event), id: chatId });
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, chatId: string) {
    event.preventDefault();

    if (dragId !== null && dragId !== chatId) {
      reorderChat(dragId, chatId, isBefore(event));
    }

    setDragId(null);
    setDropTarget(null);
  }

  function handleDragEnd() {
    setDragId(null);
    setDropTarget(null);
  }

  if (props.chats.length === 0) {
    return <EmptyState title="Nothing here" />;
  }

  return (
    <div>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {shown.map((chat) => {
          const active = chat.id === props.activeChatId;
          const finished = !chat.running && finishedChatIds.includes(chat.id);
          const highlighted = active && !finished;
          const dragging = chat.id === dragId;
          const showBefore = dropTarget?.id === chat.id && dropTarget.before;
          const showAfter = dropTarget?.id === chat.id && !dropTarget.before;

          return (
            <li
              className="relative"
              draggable={!props.searching}
              key={chat.id}
              onDragEnd={handleDragEnd}
              onDragOver={(event) => handleDragOver(event, chat.id)}
              onDragStart={(event) => handleDragStart(event, chat.id)}
              onDrop={(event) => handleDrop(event, chat.id)}
            >
              {showBefore && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-1 -top-1 flex items-center gap-1.5"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-zinc-100" />
                  <span className="h-0.5 flex-1 rounded-full bg-zinc-100" />
                </span>
              )}

              <button
                className={
                  highlighted
                    ? `flex w-full cursor-grab items-center gap-2.5 rounded-lg bg-zinc-800 px-3 py-2 text-left text-sm font-light active:cursor-grabbing ${themeColors.primary} ${dragging ? "opacity-40" : ""}`
                    : `group/chat flex w-full cursor-grab items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-light transition hover:bg-zinc-900 hover:text-zinc-100 active:cursor-grabbing ${finished ? themeColors.primary : themeColors.dimmed} ${dragging ? "opacity-40" : ""}`
                }
                onClick={() => props.onOpenChat(chat.id)}
                onContextMenu={(event) => props.onChatMenu(event, chat.id)}
                title={chat.title}
                type="button"
              >
                <ChatBubbleLeftIcon
                  aria-hidden="true"
                  className={
                    active || finished
                      ? `size-4 shrink-0 ${themeColors.primary}`
                      : `size-4 shrink-0 transition group-hover/chat:text-zinc-100 ${themeColors.dimmed}`
                  }
                />

                <span className="min-w-0 flex-1 truncate">{chat.title}</span>

                {chat.running && (
                  <span
                    className={
                      active
                        ? `shrink-0 ${themeColors.primary}`
                        : `shrink-0 ${themeColors.dimmed}`
                    }
                  >
                    <LoadingSpinner />
                  </span>
                )}

                {finished && (
                  <span
                    className="size-1 shrink-0 rounded-full bg-zinc-50 light:bg-zinc-900"
                    title="Finished"
                  />
                )}
              </button>

              {showAfter && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-1 -bottom-1 flex items-center gap-1.5"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-zinc-100" />
                  <span className="h-0.5 flex-1 rounded-full bg-zinc-100" />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {!props.searching && hiddenCount > 0 && (
        <button
          className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-xs font-light text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
          onClick={() => setExpanded(true)}
          type="button"
        >
          Show {hiddenCount} more
        </button>
      )}

      {!props.searching &&
        hiddenCount === 0 &&
        expanded &&
        props.chats.length > visibleLimit && (
          <button
            className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-xs font-light text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
            onClick={() => setExpanded(false)}
            type="button"
          >
            Show less
          </button>
        )}
    </div>
  );
}

export default SectionChatList;
