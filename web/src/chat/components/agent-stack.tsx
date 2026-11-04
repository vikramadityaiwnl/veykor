import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { TeamMember } from "@veykor/shared";
import AgentAvatar from "../../agents/components/agent-avatar.tsx";
import { themeColors } from "../../theme/theme-colors.ts";

interface Props {
  members: Array<TeamMember>;
  selectedId: string;
  onSelectMember: (id: string) => void;
}

const panelWidth = 256;

function AgentStack(props: Props) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!anchor) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAnchor(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchor]);

  if (props.members.length === 0) {
    return null;
  }

  if (props.members.length <= 2) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        {props.members.map((member) => {
          const selected = member.isMain
            ? !props.selectedId
            : props.selectedId === member.id;

          return (
            <button
              key={member.id}
              aria-label={`Open ${member.name}`}
              aria-pressed={selected}
              className={`relative shrink-0 rounded-full p-0.5 ring-1 transition ${selected ? "ring-zinc-400" : "ring-transparent hover:ring-zinc-700"}`}
              onClick={() =>
                props.onSelectMember(member.isMain ? "" : member.id)
              }
              title={member.name}
              type="button"
            >
              <AgentAvatar name={member.name} size={28} />

              <span
                aria-label={member.status === "running" ? "Working" : "Idle"}
                className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-zinc-950 ${
                  member.status === "running" ? "bg-emerald-400" : "bg-zinc-500"
                }`}
              />
            </button>
          );
        })}
      </div>
    );
  }

  function openList(event: MouseEvent<HTMLButtonElement>) {
    setAnchor(event.currentTarget.getBoundingClientRect());
  }

  function selectMember(member: TeamMember) {
    setAnchor(null);
    props.onSelectMember(member.isMain ? "" : member.id);
  }

  const left = anchor
    ? Math.min(
        Math.max(anchor.right - panelWidth, 8),
        window.innerWidth - panelWidth - 8,
      )
    : 8;
  const top = anchor ? anchor.bottom + 8 : 8;

  return (
    <>
      <button
        aria-label="Open agent list"
        className="flex shrink-0 cursor-pointer items-center"
        onClick={openList}
        title="Agents"
        type="button"
      >
        {props.members.map((member, index) => (
          <span
            key={member.id}
            className={`relative rounded-full ring-2 ring-zinc-950 ${index > 0 ? "-ml-2" : ""}`}
          >
            <AgentAvatar name={member.name} size={28} />
          </span>
        ))}
      </button>

      {anchor &&
        createPortal(
          <>
            <button
              aria-label="Close agent list"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setAnchor(null)}
              type="button"
            />

            <div
              className="fixed z-50 max-h-80 w-64 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
              style={{ left: Math.max(left, 8), top }}
            >
              {props.members.map((member) => {
                const selected = member.isMain
                  ? !props.selectedId
                  : props.selectedId === member.id;

                return (
                  <button
                    key={member.id}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${
                      selected ? "bg-zinc-800" : "hover:bg-zinc-800"
                    }`}
                    onClick={() => selectMember(member)}
                    type="button"
                  >
                    <span className="relative shrink-0 rounded-full">
                      <AgentAvatar name={member.name} size={28} />

                      <span
                        aria-hidden="true"
                        className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-zinc-950 ${
                          member.status === "running"
                            ? "bg-emerald-400"
                            : "bg-zinc-500"
                        }`}
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-light text-zinc-200">
                        {member.name}
                      </span>

                      <span
                        className={`block truncate text-[11px] font-light ${themeColors.muted}`}
                      >
                        {member.status}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

export default AgentStack;
