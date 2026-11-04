import { useTeamStore } from "../team-store.ts";
import MemberSession from "./member-session.tsx";

function TeamPanel() {
  const snapshot = useTeamStore((state) => state.snapshot);
  const tabs = useTeamStore((state) => state.tabs);
  const selectedId = useTeamStore((state) => state.selectedId);

  return (
    <aside
      aria-label="Team sessions"
      className={`${selectedId ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col border-t border-zinc-800 lg:border-l lg:border-t-0`}
    >
      {tabs.map((id) => {
        const member = snapshot.members.find((entry) => entry.id === id);

        return member ? (
          <div
            key={id}
            id={`agent-panel-${id}`}
            role="tabpanel"
            aria-labelledby={`agent-tab-${id}`}
            hidden={selectedId !== id}
            className={selectedId === id ? "min-h-0 flex-1" : "hidden"}
          >
            <MemberSession member={member} active={selectedId === id} />
          </div>
        ) : null;
      })}
    </aside>
  );
}

export default TeamPanel;
