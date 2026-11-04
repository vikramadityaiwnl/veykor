import { create } from "zustand";
import type { TeamSnapshot } from "@veykor/shared";
import { fetchTeam } from "./team-client.ts";

let watchGeneration = 0;

interface TeamState {
  rootId: string;
  snapshot: TeamSnapshot;
  selectedId: string;
  tabs: string[];
  error: string;
  select: (id: string) => void;
  close: (id: string) => void;
  refresh: () => Promise<void>;
  watch: (rootId: string) => () => void;
}

const emptyTeam: TeamSnapshot = {
  rootId: "",
  members: [],
  events: [],
  availableAgents: [],
};

export const useTeamStore = create<TeamState>((set, get) => ({
  rootId: "",
  snapshot: emptyTeam,
  selectedId: "",
  tabs: [],
  error: "",
  select: (id) => {
    if (!id) {
      set({ selectedId: "" });
      return;
    }

    set((state) => ({
      selectedId: id,
      tabs: state.tabs.includes(id) ? state.tabs : [...state.tabs, id],
    }));
  },
  close: (id) => {
    set((state) => {
      const tabs = state.tabs.filter((entry) => entry !== id);

      return {
        tabs,
        selectedId:
          state.selectedId === id ? (tabs.at(-1) ?? "") : state.selectedId,
      };
    });
  },
  refresh: async () => {
    const rootId = get().rootId;
    const generation = watchGeneration;

    if (!rootId) {
      return;
    }

    try {
      const snapshot = await fetchTeam(rootId);

      if (get().rootId === rootId && generation === watchGeneration) {
        set((state) => {
          const resolve = (id: string) => {
            if (snapshot.members.some((member) => member.id === id)) {
              return id;
            }

            const agentId = state.snapshot.members.find(
              (member) => member.id === id,
            )?.agentId;

            return (
              snapshot.members.find(
                (member) => agentId && member.agentId === agentId,
              )?.id ?? ""
            );
          };
          const tabs = [
            ...new Set(
              state.tabs
                .map(resolve)
                .filter((id) => id !== "" && id !== snapshot.rootId),
            ),
          ];

          return {
            snapshot,
            error: "",
            tabs,
            selectedId:
              resolve(state.selectedId) === snapshot.rootId
                ? ""
                : resolve(state.selectedId),
          };
        });
      }
    } catch (cause) {
      if (get().rootId === rootId && generation === watchGeneration) {
        set({
          error:
            cause instanceof Error
              ? cause.message
              : "Unable to load this team.",
        });
      }
    }
  },
  watch: (rootId) => {
    watchGeneration += 1;
    set({
      rootId,
      snapshot: { ...emptyTeam, rootId },
      selectedId: "",
      tabs: [],
      error: "",
    });

    if (!rootId) {
      return () => {};
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      await get().refresh();

      if (!stopped) {
        timer = setTimeout(() => {
          void poll();
        }, 1500);
      }
    };

    void poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  },
}));
