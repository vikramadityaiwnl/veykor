import type { TeamMember } from "@veykor/shared";
import AgentAvatar from "../../agents/components/agent-avatar.tsx";

interface Props {
  member: TeamMember;
  selected: boolean;
  onSelect: (id: string) => void;
}

function TeamAvatar(props: Props) {
  const working = props.member.status === "running";

  return (
    <button
      aria-label={`Open ${props.member.name}`}
      aria-pressed={props.selected}
      className={`relative shrink-0 rounded-full p-0.5 ring-1 transition ${props.selected ? "ring-zinc-400" : "ring-transparent hover:ring-zinc-700"}`}
      onClick={() => props.onSelect(props.member.id)}
      title={props.member.name}
      type="button"
    >
      <AgentAvatar name={props.member.name} size={28} />
      <span
        aria-label={working ? "Working" : "Idle"}
        className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-zinc-950 ${working ? "bg-emerald-400" : "bg-zinc-500"}`}
      />
    </button>
  );
}

export default TeamAvatar;
