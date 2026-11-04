import { FolderIcon } from "@heroicons/react/24/outline";
import type { TeamMember } from "@veykor/shared";
import AgentTabs from "../../teams/components/agent-tabs.tsx";
import TeamAvatar from "../../teams/components/team-avatar.tsx";

interface Props {
  title: string;
  projectName: string;
  members: TeamMember[];
  selectedId: string;
  onSelectMember: (id: string) => void;
  workMode: boolean;
}

function ChatNavbar(props: Props) {
  return (
    <header className="flex shrink-0 flex-col border-b border-zinc-800 lg:flex-row">
      <div className="flex h-14 min-w-0 flex-1 items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3 text-sm font-light">
          {props.workMode && props.projectName && (
            <>
              <FolderIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-zinc-500"
              />
              <span
                className="max-w-40 truncate text-zinc-500"
                title={props.projectName}
              >
                {props.projectName}
              </span>
              <span aria-hidden="true" className="text-zinc-600">
                /
              </span>
            </>
          )}
          <span className="truncate text-zinc-100" title={props.title}>
            {props.title}
          </span>
        </div>

        {props.workMode && (
          <div
            className="flex max-w-[45%] min-w-0 items-center gap-1.5 overflow-x-auto py-2"
            aria-label="Agent avatars"
          >
            {props.members
              .filter((member) => !member.isMain)
              .map((member) => (
                <TeamAvatar
                  key={member.id}
                  member={member}
                  selected={props.selectedId === member.id}
                  onSelect={props.onSelectMember}
                />
              ))}
          </div>
        )}
      </div>

      {props.workMode && props.selectedId && (
        <div className="h-14 min-w-0 flex-1 border-t border-zinc-800 lg:border-l lg:border-t-0">
          <AgentTabs />
        </div>
      )}
    </header>
  );
}

export default ChatNavbar;
