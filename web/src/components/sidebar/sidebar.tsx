import { useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import {
  ArrowsPointingInIcon,
  ChatBubbleLeftIcon,
  FolderIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { AuthUser } from "@veykor/shared";
import { themeColors } from "../../theme/colors.ts";
import { semanticColors } from "../../theme/semantic-colors.ts";
import AlertDialog from "../../components/alert-dialog/alert-dialog.tsx";
import CollapsibleSection from "../../components/collapsible-section/collapsible-section.tsx";
import ContextMenu from "../../components/context-menu/context-menu.tsx";
import type {
  ContextMenuChild,
  ContextMenuEntry,
  ContextMenuItem,
} from "../../components/context-menu/context-menu.tsx";
import Dialog from "../../components/dialog/dialog.tsx";
import EmptyState from "../../components/empty-state/empty-state.tsx";
import ProfileCard from "../../components/profile-card/profile-card.tsx";
import SearchInput from "../../components/search-input/search-input.tsx";
import SegmentedControl from "../../components/segmented-control/segmented-control.tsx";
import { defaultChats } from "../../workspace/chats.ts";
import { usePreferencesStore } from "../../workspace/preferences-store.ts";
import { useProfileStore } from "../../profile/profile-store.ts";

interface Props {
  onSignOut: () => void;
  signingOut: boolean;
  user: AuthUser;
}

type MenuContext =
  | { kind: "blank" }
  | { kind: "chat"; chatId: string }
  | { kind: "section"; sectionId: string };

type DialogState =
  | { kind: "create-section" }
  | { kind: "rename-section"; sectionId: string }
  | { kind: "rename-chat"; chatId: string };

type AlertState =
  | { kind: "delete-chat"; chatId: string }
  | { kind: "delete-section"; sectionId: string };

function Sidebar(props: Props) {
  const lastTab = usePreferencesStore((state) => state.lastTab);
  const sections = usePreferencesStore((state) => state.sections);
  const chatSections = usePreferencesStore((state) => state.chatSections);
  const chatTitles = usePreferencesStore((state) => state.chatTitles);
  const customChats = usePreferencesStore((state) => state.customChats);
  const removedChatIds = usePreferencesStore((state) => state.removedChatIds);
  const load = usePreferencesStore((state) => state.load);
  const setLastTab = usePreferencesStore((state) => state.setLastTab);
  const setSectionOpen = usePreferencesStore((state) => state.setSectionOpen);
  const collapseAll = usePreferencesStore((state) => state.collapseAll);
  const addSection = usePreferencesStore((state) => state.addSection);
  const renameSection = usePreferencesStore((state) => state.renameSection);
  const deleteSection = usePreferencesStore((state) => state.deleteSection);
  const moveChat = usePreferencesStore((state) => state.moveChat);
  const renameChat = usePreferencesStore((state) => state.renameChat);
  const deleteChat = usePreferencesStore((state) => state.deleteChat);
  const addChat = usePreferencesStore((state) => state.addChat);
  const storedUsername = useProfileStore((state) => state.username);
  const storedTag = useProfileStore((state) => state.tag);
  const loadProfile = useProfileStore((state) => state.load);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    context: MenuContext;
  } | null>(null);
  const [activeChatId, setActiveChatId] = useState(defaultChats[0].id);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogTitle, setDialogTitle] = useState("");
  const [alert, setAlert] = useState<AlertState | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);

  const fallbackSectionId = sections[0]?.id ?? "";
  const searching = debouncedQuery.trim() !== "";

  function displayTitle(chatId: string, fallback: string) {
    return chatTitles[chatId] ?? fallback;
  }

  const allChats = [...defaultChats, ...customChats].filter(
    (chat) => !removedChatIds.includes(chat.id),
  );

  const matchingChats = allChats.filter((chat) =>
    displayTitle(chat.id, chat.title)
      .toLowerCase()
      .includes(debouncedQuery.trim().toLowerCase()),
  );

  function chatsInSection(sectionId: string) {
    return matchingChats.filter(
      (chat) => (chatSections[chat.id] ?? fallbackSectionId) === sectionId,
    );
  }

  const alertChatTitle =
    alert?.kind === "delete-chat"
      ? displayTitle(
          alert.chatId,
          allChats.find((chat) => chat.id === alert.chatId)?.title ?? "",
        )
      : "";

  const alertSectionTitle =
    alert?.kind === "delete-section"
      ? (sections.find((section) => section.id === alert.sectionId)?.title ??
        "")
      : "";

  function menuItemsFor(context: MenuContext): Array<ContextMenuEntry> {
    if (context.kind === "chat") {
      return [
        {
          kind: "item",
          icon: (
            <FolderIcon aria-hidden="true" className="size-4 text-zinc-400" />
          ),
          id: "move",
          label: "Move to",
          children: sections.map((section) => ({
            icon: (
              <FolderIcon aria-hidden="true" className="size-4 text-zinc-400" />
            ),
            id: `move:${section.id}`,
            label: section.title,
          })),
        },
        {
          kind: "item",
          icon: (
            <PencilIcon aria-hidden="true" className="size-4 text-zinc-400" />
          ),
          id: "rename-chat",
          label: "Rename",
        },
        { kind: "divider" },
        {
          kind: "item",
          icon: (
            <TrashIcon
              aria-hidden="true"
              className={`size-4 ${semanticColors.delete.text}`}
            />
          ),
          id: "delete-chat",
          label: "Delete",
          danger: true,
        },
      ];
    }

    if (context.kind === "section") {
      return [
        {
          kind: "item",
          icon: (
            <PencilIcon aria-hidden="true" className="size-4 text-zinc-400" />
          ),
          id: "rename",
          label: "Rename",
        },
        {
          kind: "item",
          icon: (
            <TrashIcon aria-hidden="true" className="size-4 text-zinc-400" />
          ),
          id: "delete",
          label: "Delete",
        },
      ];
    }

    return [
      {
        kind: "item",
        icon: <PlusIcon aria-hidden="true" className="size-4 text-zinc-400" />,
        id: "new-section",
        label: "New Section",
      },
      {
        kind: "item",
        icon: (
          <ArrowsPointingInIcon
            aria-hidden="true"
            className="size-4 text-zinc-400"
          />
        ),
        id: "collapse-all",
        label: "Collapse all",
      },
    ];
  }

  function handleContextMenu(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;

    if (target.closest("button, input, a, kbd")) {
      return;
    }

    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, context: { kind: "blank" } });
  }

  function handleChatMenu(
    event: MouseEvent<HTMLButtonElement>,
    chatId: string,
  ) {
    event.preventDefault();

    setMenu({
      x: event.clientX,
      y: event.clientY,
      context: { kind: "chat", chatId },
    });
  }

  function handleSectionMenu(
    event: MouseEvent<HTMLButtonElement>,
    sectionId: string,
  ) {
    event.preventDefault();

    setMenu({
      x: event.clientX,
      y: event.clientY,
      context: { kind: "section", sectionId },
    });
  }

  function handleSelectMenu(item: ContextMenuItem | ContextMenuChild) {
    const context = menu?.context;

    setMenu(null);

    if (!context) {
      return;
    }

    if (item.id === "new-section") {
      setDialogTitle("");
      setDialog({ kind: "create-section" });
      return;
    }

    if (item.id === "collapse-all") {
      collapseAll();
      return;
    }

    if (item.id === "rename" && context.kind === "section") {
      const section = sections.find((entry) => entry.id === context.sectionId);

      setDialogTitle(section?.title ?? "");
      setDialog({ kind: "rename-section", sectionId: context.sectionId });
      return;
    }

    if (item.id === "delete" && context.kind === "section") {
      setAlert({ kind: "delete-section", sectionId: context.sectionId });
      return;
    }

    if (item.id === "rename-chat" && context.kind === "chat") {
      const chat = allChats.find((entry) => entry.id === context.chatId);

      setDialogTitle(displayTitle(context.chatId, chat?.title ?? ""));
      setDialog({ kind: "rename-chat", chatId: context.chatId });
      return;
    }

    if (item.id === "delete-chat" && context.kind === "chat") {
      setAlert({ kind: "delete-chat", chatId: context.chatId });
      return;
    }

    if (item.id.startsWith("move:") && context.kind === "chat") {
      moveChat(context.chatId, item.id.slice("move:".length));
    }
  }

  function handleSubmitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = dialogTitle.trim();

    if (dialog?.kind === "create-section" && title !== "") {
      addSection(title);
    }

    if (dialog?.kind === "rename-section" && title !== "") {
      renameSection(dialog.sectionId, title);
    }

    if (dialog?.kind === "rename-chat" && title !== "") {
      renameChat(dialog.chatId, title);
    }

    setDialogTitle("");
    setDialog(null);
  }

  function handleConfirmAlert() {
    if (alert?.kind === "delete-chat") {
      deleteChat(alert.chatId);
    }

    if (alert?.kind === "delete-section") {
      deleteSection(alert.sectionId);
    }

    setAlert(null);
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      const target = event.target as HTMLElement;

      if (
        event.key === "/" &&
        target.tagName !== "INPUT" &&
        target.tagName !== "TEXTAREA"
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <aside
      className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950"
      onContextMenu={handleContextMenu}
    >
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2 px-1">
          <h1 className="shrink-0 text-lg font-semibold text-zinc-50">
            veykor
          </h1>

          <div className="w-36">
            <SegmentedControl
              label="Workspace mode"
              onChange={setLastTab}
              options={[
                { label: "Chat", value: "chat" },
                { label: "Work", value: "work" },
              ]}
              size="sm"
              value={lastTab}
            />
          </div>
        </div>

        <SearchInput
          commandLabel="⌘"
          inputRef={searchRef}
          keyLabel="K"
          onChange={setQuery}
          placeholder="Search chats..."
          value={query}
        />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-4 pt-0">
        {lastTab === "chat" &&
          sections.map((section) => {
            const visible = chatsInSection(section.id);

            if (searching && visible.length === 0) {
              return null;
            }

            return (
              <div key={section.id} className="group">
                <CollapsibleSection
                  action={
                    <button
                      aria-label="New chat"
                      className="pointer-events-none grid size-7 place-items-center rounded-lg text-zinc-500 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-100 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                      onClick={() => addChat(section.id)}
                      title="New chat"
                      type="button"
                    >
                      <PlusIcon aria-hidden="true" className="size-4" />
                    </button>
                  }
                  active={visible.some((chat) => chat.id === activeChatId)}
                  onTitleContextMenu={(event) =>
                    handleSectionMenu(event, section.id)
                  }
                  onToggle={() => setSectionOpen(section.id, !section.open)}
                  open={section.open}
                  title={section.title}
                >
                  {visible.length === 0 ? (
                    <EmptyState title="Nothing here" />
                  ) : (
                    <ul className="max-h-64 space-y-1 overflow-y-auto">
                      {visible.map((chat) => {
                        const active = chat.id === activeChatId;

                        return (
                          <li key={chat.id}>
                            <button
                              className={
                                active
                                  ? `flex w-full items-center gap-2.5 rounded-lg bg-zinc-800 px-3 py-2 text-left text-sm font-light ${themeColors.primary}`
                                  : `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-light transition hover:bg-zinc-900 hover:text-zinc-100 ${themeColors.dimmed}`
                              }
                              onClick={() => setActiveChatId(chat.id)}
                              onContextMenu={(event) =>
                                handleChatMenu(event, chat.id)
                              }
                              type="button"
                            >
                              <ChatBubbleLeftIcon
                                aria-hidden="true"
                                className={
                                  active
                                    ? `size-4 shrink-0 ${themeColors.primary}`
                                    : `size-4 shrink-0 ${themeColors.dimmed}`
                                }
                              />

                              <span className="truncate">
                                {displayTitle(chat.id, chat.title)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CollapsibleSection>
              </div>
            );
          })}

        {lastTab === "chat" && sections.length === 0 && !searching && (
          <EmptyState
            description="Right-click here to add one."
            title="No sections yet"
          />
        )}

        {lastTab === "chat" && searching && matchingChats.length === 0 && (
          <EmptyState
            description={`No chats match "${debouncedQuery.trim()}".`}
            title="Nothing here"
          />
        )}

        {lastTab === "work" && (
          <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center">
            <p className="text-sm font-semibold text-zinc-300">
              Agentic workflows
            </p>

            <p className="pt-1 text-xs font-light text-zinc-500">
              Your runs and automations will live here.
            </p>
          </div>
        )}
      </nav>

      <div className="p-4">
        <ProfileCard
          description={storedTag === "" ? "Building" : storedTag}
          name={storedUsername === "" ? props.user.username : storedUsername}
          onSignOut={props.onSignOut}
          signingOut={props.signingOut}
        />
      </div>

      {menu && (
        <ContextMenu
          items={menuItemsFor(menu.context)}
          onClose={() => setMenu(null)}
          onSelect={handleSelectMenu}
          x={menu.x}
          y={menu.y}
        />
      )}

      {dialog && (
        <Dialog
          description={
            dialog.kind === "create-section"
              ? "Give your section a name to keep chats organized."
              : dialog.kind === "rename-section"
                ? "Choose a new name for this section."
                : "Choose a new name for this chat."
          }
          onClose={() => setDialog(null)}
          title={
            dialog.kind === "create-section"
              ? "New section"
              : dialog.kind === "rename-section"
                ? "Rename section"
                : "Rename chat"
          }
        >
          <form className="space-y-4" onSubmit={handleSubmitDialog}>
            <input
              autoFocus
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
              onChange={(event) => setDialogTitle(event.target.value)}
              placeholder={
                dialog.kind === "rename-chat"
                  ? "Enter the chat name"
                  : "Enter the section title"
              }
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
                className="cursor-pointer rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white"
                type="submit"
              >
                {dialog.kind === "create-section" ? "Create" : "Save"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {alert && (
        <AlertDialog
          confirmLabel="Delete"
          description={
            alert.kind === "delete-chat"
              ? `"${alertChatTitle}" will be permanently removed.`
              : `"${alertSectionTitle}" and all chats in it will be permanently removed.`
          }
          onClose={() => setAlert(null)}
          onConfirm={handleConfirmAlert}
          title={
            alert.kind === "delete-chat" ? "Delete chat" : "Delete section"
          }
        />
      )}
    </aside>
  );
}

export default Sidebar;
