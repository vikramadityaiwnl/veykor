import { useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import {
  ArrowsPointingInIcon,
  ChatBubbleLeftIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import type { AuthUser } from "@veykor/shared";
import CollapsibleSection from "../../components/collapsible-section/collapsible-section.tsx";
import ContextMenu from "../../components/context-menu/context-menu.tsx";
import type { ContextMenuItem } from "../../components/context-menu/context-menu.tsx";
import Dialog from "../../components/dialog/dialog.tsx";
import ProfileCard from "../../components/profile-card/profile-card.tsx";
import SearchInput from "../../components/search-input/search-input.tsx";
import SegmentedControl from "../../components/segmented-control/segmented-control.tsx";

interface ChatPreview {
  id: string;
  title: string;
}

interface Props {
  onSignOut: () => void;
  signingOut: boolean;
  user: AuthUser;
}

type SidebarTab = "chat" | "work";

const chatPreviews: Array<ChatPreview> = [
  { id: "getting-started", title: "Getting started" },
  { id: "api-design", title: "API design" },
  { id: "debug-session", title: "Debug session" },
];

const contextMenuItems: Array<ContextMenuItem> = [
  {
    icon: <PlusIcon aria-hidden="true" className="size-4 text-zinc-400" />,
    id: "new-section",
    label: "New Section",
  },
  {
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

function Sidebar(props: Props) {
  const [tab, setTab] = useState<SidebarTab>("chat");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [chatsOpen, setChatsOpen] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeChatId, setActiveChatId] = useState(chatPreviews[0].id);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");

  const searchRef = useRef<HTMLInputElement | null>(null);

  const visibleChats = chatPreviews.filter((chat) =>
    chat.title.toLowerCase().includes(debouncedQuery.trim().toLowerCase()),
  );

  function handleContextMenu(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;

    if (target.closest("button, input, a, kbd")) {
      return;
    }

    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  }

  function handleSelectMenu(item: ContextMenuItem) {
    setMenu(null);

    if (item.id === "new-section") {
      setSectionTitle("");
      setDialogOpen(true);
      return;
    }

    if (item.id === "collapse-all") {
      setChatsOpen(false);
    }
  }

  function handleNewChat() {
    setQuery("");
    searchRef.current?.focus();
  }

  function handleCreateSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSectionTitle("");
    setDialogOpen(false);
  }

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
              onChange={setTab}
              options={[
                { label: "Chat", value: "chat" },
                { label: "Work", value: "work" },
              ]}
              size="sm"
              value={tab}
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
        {tab === "chat" && (
          <div className="group">
            <CollapsibleSection
              action={
                <button
                  aria-label="New chat"
                  className="grid size-7 place-items-center rounded-lg text-zinc-500 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-100 focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={handleNewChat}
                  title="New chat"
                  type="button"
                >
                  <PlusIcon aria-hidden="true" className="size-4" />
                </button>
              }
              onToggle={() => setChatsOpen(!chatsOpen)}
              open={chatsOpen}
              title="Chats"
            >
              <ul className="space-y-1">
                {visibleChats.map((chat) => {
                  const active = chat.id === activeChatId;

                  return (
                    <li key={chat.id}>
                      <button
                        className={
                          active
                            ? "flex w-full items-center gap-2.5 rounded-lg bg-zinc-800 px-3 py-2 text-left text-sm font-semibold text-zinc-50"
                            : "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-light text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-100"
                        }
                        onClick={() => setActiveChatId(chat.id)}
                        type="button"
                      >
                        <ChatBubbleLeftIcon
                          aria-hidden="true"
                          className={
                            active
                              ? "size-4 shrink-0 text-zinc-50"
                              : "size-4 shrink-0 text-zinc-500"
                          }
                        />

                        <span className="truncate">{chat.title}</span>
                      </button>
                    </li>
                  );
                })}

                {visibleChats.length === 0 && (
                  <li>
                    <p className="px-3 py-2 text-sm font-light text-zinc-500">
                      No chats match your search.
                    </p>
                  </li>
                )}
              </ul>
            </CollapsibleSection>
          </div>
        )}

        {tab === "work" && (
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
          description="building"
          name={props.user.username}
          onSignOut={props.onSignOut}
          signingOut={props.signingOut}
        />
      </div>

      {menu && (
        <ContextMenu
          items={contextMenuItems}
          onClose={() => setMenu(null)}
          onSelect={handleSelectMenu}
          x={menu.x}
          y={menu.y}
        />
      )}

      {dialogOpen && (
        <Dialog
          description="Give your section a name to keep chats organized."
          onClose={() => setDialogOpen(false)}
          title="New section"
        >
          <form className="space-y-4" onSubmit={handleCreateSection}>
            <input
              autoFocus
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
              onChange={(event) => setSectionTitle(event.target.value)}
              placeholder="Enter the section title"
              type="text"
              value={sectionTitle}
            />

            <div className="flex justify-end gap-2">
              <button
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800"
                onClick={() => setDialogOpen(false)}
                type="button"
              >
                Cancel
              </button>

              <button
                className="cursor-pointer rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white"
                type="submit"
              >
                Create
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </aside>
  );
}

export default Sidebar;
