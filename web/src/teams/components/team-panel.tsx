import { useTeamStore } from "../team-store.ts";
import { isChangesTab } from "../changes-tab.ts";
import ChangesPanel from "./changes-panel.tsx";
import MemberSession from "./member-session.tsx";

function TeamPanel() {
  const snapshot = useTeamStore((state) => state.snapshot);
  const tabs = useTeamStore((state) => state.tabs);
  const selectedId = useTeamStore((state) => state.selectedId);

  return (
    <aside
      aria-label="Team sessions"
      className={`${selectedId ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col border-t border-zinc-800 lg:w-1/2 lg:flex-none lg:border-l lg:border-t-0`}
    >
      {tabs.map((id) => {
        if (isChangesTab(id)) {
          return (
            <div
              key={id}
              id={`agent-panel-${id}`}
              role="tabpanel"
              aria-labelledby={`agent-tab-${id}`}
              hidden={selectedId !== id}
              className={selectedId === id ? "min-h-0 flex-1" : "hidden"}
            >
              {selectedId === id && <ChangesPanel />}
            </div>
          );
        }

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
