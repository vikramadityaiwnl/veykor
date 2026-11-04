import { useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { ChatSummary } from "@veykor/shared";
import { useNavigate } from "react-router";
import AlertDialog from "../../components/alert-dialog/alert-dialog.tsx";
import ContextMenu from "../../components/context-menu/context-menu.tsx";
import Dialog from "../../components/dialog/dialog.tsx";
import LoadingSpinner from "../../components/loading-spinner/loading-spinner.tsx";
import { useChatStore } from "../../chat/chat-store.ts";

interface Props {
  projectId: string;
  query: string;
}

function ProjectSessions(props: Props) {
  const chats = useChatStore((state) => state.chats);
  const activeChatId = useChatStore((state) => state.activeChatId);
  const finishedChatIds = useChatStore((state) => state.finishedChatIds);
  const renameChat = useChatStore((state) => state.renameChat);
  const removeChat = useChatStore((state) => state.deleteChat);
  const navigate = useNavigate();

  const [showAll, setShowAll] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    chat: ChatSummary;
  } | null>(null);
  const [dialog, setDialog] = useState<{ chatId: string } | null>(null);
  const [dialogTitle, setDialogTitle] = useState("");
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);

  const sessions = chats.filter(
    (chat) =>
      chat.projectId === props.projectId &&
      chat.title.toLowerCase().includes(props.query.toLowerCase()),
  );

  const searching = props.query.trim() !== "";
  const shown = showAll || searching ? sessions : sessions.slice(0, 5);

  function handleSessionMenu(
    event: MouseEvent<HTMLButtonElement>,
    chat: ChatSummary,
  ) {
    event.preventDefault();
    event.stopPropagation();

    setMenu({ x: event.clientX, y: event.clientY, chat });
  }

  function handleSubmitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = dialogTitle.trim();

    if (dialog && title !== "") {
      void renameChat(dialog.chatId, title);
    }

    setDialogTitle("");
    setDialog(null);
  }

  function handleConfirmDelete() {
    if (!deleting) {
      return;
    }

    if (deleting.id === activeChatId) {
      useChatStore
        .getState()
        .startDraft(useChatStore.getState().pendingSectionId);
      navigate(`/work/${props.projectId}`, { replace: true });
    }

    void removeChat(deleting.id);
    setDeleting(null);
  }

  return (
    <div className="ml-5 space-y-1">
      {shown.map((chat) => {
        const active = chat.id === activeChatId;
        const finished = !chat.running && finishedChatIds.includes(chat.id);

        return (
          <button
            key={chat.id}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${active ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"}`}
            onClick={() => navigate(`/work/${props.projectId}/chat/${chat.id}`)}
            onContextMenu={(event) => handleSessionMenu(event, chat)}
            title={chat.title}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">{chat.title}</span>

            {chat.running && (
              <span className="shrink-0">
                <LoadingSpinner size="sm" />
              </span>
            )}

            {finished && (
              <span
                className="size-1 shrink-0 rounded-full bg-zinc-50 light:bg-zinc-900"
                title="Finished"
              />
            )}
          </button>
        );
      })}

      {!searching && sessions.length > 5 && (
        <button
          type="button"
          className="px-2 py-1.5 text-xs font-light text-zinc-500 hover:text-zinc-200"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show less" : `Show ${sessions.length - 5} more`}
        </button>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              kind: "item",
              id: "rename",
              label: "Rename",
              icon: <PencilIcon className="size-4" />,
            },
            { kind: "divider" },
            {
              kind: "item",
              id: "delete",
              disabled: chats.some(
                (chat) => chat.id === menu.chat.id && chat.running,
              ),
              label: chats.some(
                (chat) => chat.id === menu.chat.id && chat.running,
              )
                ? "Stop to delete"
                : "Delete",
              danger: true,
              icon: <TrashIcon className="size-4 text-red-400" />,
            },
          ]}
          onSelect={(item) => {
            if (item.id === "rename") {
              setDialogTitle(menu.chat.title);
              setDialog({ chatId: menu.chat.id });
            } else {
              setDeleting(menu.chat);
            }

            setMenu(null);
          }}
        />
      )}

      {dialog && (
        <Dialog
          description="Choose a new name for this session."
          onClose={() => setDialog(null)}
          title="Rename session"
        >
          <form className="space-y-4" onSubmit={handleSubmitDialog}>
            <input
              autoFocus
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
              onChange={(event) => setDialogTitle(event.target.value)}
              placeholder="Enter the session name"
              type="text"
              value={dialogTitle}
            />

            <div className="flex justify-end gap-2">
              <button
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800"
                onClick={() => setDialog(null)}
                type="button"
              >
                Cancel
              </button>

              <button
                className="cursor-pointer rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white light:hover:bg-zinc-200"
                type="submit"
              >
                Save
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {deleting && (
        <AlertDialog
          title="Delete session"
          description={`"${deleting.title}" will be permanently removed.`}
          confirmLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

export default ProjectSessions;
