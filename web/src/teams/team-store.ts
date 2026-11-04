import { create } from "zustand";
import type { TeamSnapshot } from "@veykor/shared";
import { fetchTeam } from "./team-client.ts";
import { parsePullRequestTab, pullRequestTabId } from "./pull-request-tabs.ts";

let watchGeneration = 0;

interface TeamState {
  rootId: string;
  snapshot: TeamSnapshot;
  selectedId: string;
  tabs: string[];
  seenIds: Array<string> | null;
  pendingPr: { chatId: string; number: number } | null;
  error: string;
  select: (id: string) => void;
  close: (id: string) => void;
  openPullRequest: (chatId: string, number: number) => void;
  refresh: () => Promise<void>;
  watch: (rootId: string) => () => void;
}

function savedView(rootId: string): { tabs: string[]; selectedId: string } {
  try {
    const value = JSON.parse(
      localStorage.getItem(`veykor:team-view:${rootId}`) ?? "{}",
    );
    const tabs = Array.isArray(value.tabs)
      ? value.tabs.filter((id: unknown) => typeof id === "string")
      : [];
    return {
      tabs,
      selectedId:
        typeof value.selectedId === "string" && tabs.includes(value.selectedId)
          ? value.selectedId
          : "",
    };
  } catch {
    return { tabs: [], selectedId: "" };
  }
}

function saveView(state: TeamState) {
  if (!state.rootId) {
    return;
  }

  try {
    localStorage.setItem(
      `veykor:team-view:${state.rootId}`,
      JSON.stringify({ tabs: state.tabs, selectedId: state.selectedId }),
    );
  } catch {
    return;
  }
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
  seenIds: null,
  pendingPr: null,
  error: "",
  select: (id) => {
    if (!id) {
      set({ selectedId: "" });
      saveView(get());
      return;
    }

    set((state) => ({
      selectedId: id,
      tabs: state.tabs.includes(id) ? state.tabs : [...state.tabs, id],
    }));
    saveView(get());
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
    saveView(get());
  },
  openPullRequest: (chatId, number) => {
    if (get().rootId === chatId) {
      get().select(pullRequestTabId(number));
      return;
    }

    set({ pendingPr: { chatId, number } });
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
            if (parsePullRequestTab(id) > 0) {
              return id;
            }

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
          const waiting = snapshot.members
            .filter(
              (member) =>
                !member.isMain &&
                (member.pendingQuestions ?? 0) > 0 &&
                !tabs.includes(member.id),
            )
            .map((member) => member.id);
          const seen = state.seenIds;
          const fresh =
            seen === null
              ? []
              : snapshot.members
                  .filter(
                    (member) =>
                      !member.isMain &&
                      member.id !== snapshot.rootId &&
                      !seen.includes(member.id),
                  )
                  .map((member) => member.id);
          const opened =
            waiting.length > 0 ? waiting[0] : fresh.length > 0 ? fresh[0] : "";
          const resolved =
            resolve(state.selectedId) === snapshot.rootId
              ? ""
              : resolve(state.selectedId);

          return {
            snapshot,
            error: "",
            seenIds: snapshot.members.map((member) => member.id),
            tabs: [...new Set([...tabs, ...waiting, ...fresh])],
            selectedId: resolved === "" && opened !== "" ? opened : resolved,
          };
        });
        saveView(get());
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
    const pending = get().pendingPr;

    set({
      rootId,
      snapshot: { ...emptyTeam, rootId },
      ...savedView(rootId),
      seenIds: null,
      error: "",
    });

    if (pending && pending.chatId === rootId) {
      set({ pendingPr: null });
      get().select(pullRequestTabId(pending.number));
    }

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
