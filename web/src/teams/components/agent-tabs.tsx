import { useEffect } from "react";
import type { KeyboardEvent } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useChatStore } from "../../chat/chat-store.ts";
import { semanticColors, themeColors } from "../../theme/theme-colors.ts";
import { parsePullRequestTab } from "../pull-request-tabs.ts";
import { useTeamStore } from "../team-store.ts";

function AgentTabs() {
  const snapshot = useTeamStore((state) => state.snapshot);
  const rootId = useTeamStore((state) => state.rootId);
  const tabs = useTeamStore((state) => state.tabs);
  const selectedId = useTeamStore((state) => state.selectedId);
  const select = useTeamStore((state) => state.select);
  const close = useTeamStore((state) => state.close);
  const chats = useChatStore((state) => state.chats);

  const chat = chats.find((entry) => entry.id === rootId);

  useEffect(() => {
    document
      .getElementById(`agent-tab-${selectedId}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  function handleKeyDown(id: string, event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();

    let index = tabs.indexOf(id);

    if (event.key === "Home") {
      index = 0;
    } else if (event.key === "End") {
      index = tabs.length - 1;
    } else {
      index =
        (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
        tabs.length;
    }

    const next = tabs[index];

    if (next !== undefined) {
      select(next);
      document.getElementById(`agent-tab-${next}`)?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Agent conversations"
      className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2"
    >
      {tabs.map((id) => {
        const member = snapshot.members.find((entry) => entry.id === id);

        return member ? (
          <div
            className={`flex shrink-0 items-center rounded-lg ${selectedId === id ? "bg-zinc-800" : "hover:bg-zinc-900"}`}
            key={id}
          >
            <button
              id={`agent-tab-${id}`}
              role="tab"
              aria-selected={selectedId === id}
              aria-controls={`agent-panel-${id}`}
              tabIndex={selectedId === id ? 0 : -1}
              className="max-w-48 truncate px-3 py-2 text-xs font-light text-zinc-300"
              title={member.name}
              type="button"
              onClick={() => select(id)}
              onKeyDown={(event) => handleKeyDown(id, event)}
            >
              {member.name}
              {member.pendingQuestions > 0 ? (
                <span
                  className="ml-1.5 inline-block rounded-full bg-amber-500/20 px-1.5 py-px text-[10px] font-medium text-amber-300"
                  title="Waiting for your answer"
                >
                  {member.pendingQuestions}
                </span>
              ) : null}
            </button>
            <button
              aria-label={`Close ${member.name} tab`}
              title="Close tab"
              className="mr-1 rounded-md p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100"
              type="button"
              onClick={() => close(id)}
            >
              <XMarkIcon aria-hidden="true" className="size-3" />
            </button>
          </div>
        ) : null;
      })}

      {tabs.map((id) => {
        const number = parsePullRequestTab(id);

        if (number === 0) {
          return null;
        }

        const merged =
          chat?.pullRequests.some(
            (pull) => pull.number === number && pull.merged,
          ) ?? false;
        const label = `#${number}`;

        return (
          <div
            className={`flex shrink-0 items-center rounded-lg ${selectedId === id ? "bg-zinc-800" : "hover:bg-zinc-900"}`}
            key={id}
          >
            <button
              id={`agent-tab-${id}`}
              role="tab"
              aria-selected={selectedId === id}
              aria-controls={`agent-panel-${id}`}
              tabIndex={selectedId === id ? 0 : -1}
              className={`max-w-48 truncate px-3 py-2 text-xs font-light ${merged ? semanticColors.success.text : themeColors.muted}`}
              title={`Pull request ${label}`}
              type="button"
              onClick={() => select(id)}
              onKeyDown={(event) => handleKeyDown(id, event)}
            >
              {label}
            </button>
            <button
              aria-label={`Close pull request ${label} tab`}
              title="Close tab"
              className="mr-1 rounded-md p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100"
              type="button"
              onClick={() => close(id)}
            >
              <XMarkIcon aria-hidden="true" className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default AgentTabs;
