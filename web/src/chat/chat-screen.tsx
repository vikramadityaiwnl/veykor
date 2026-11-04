import { useEffect } from "react";
import { useChatStore } from "./chat-store.ts";
import { useWorkStore } from "../work/work-store.ts";
import { useTeamStore } from "../teams/team-store.ts";
import TeamPanel from "../teams/components/team-panel.tsx";
import ChatNavbar from "./components/chat-navbar.tsx";
import MainChatContent from "./components/main-chat-content.tsx";

function ChatScreen() {
  const activeChatId = useChatStore((state) => state.activeChatId);
  const chats = useChatStore((state) => state.chats);
  const projectId = useWorkStore((state) => state.projectId);
  const projects = useWorkStore((state) => state.projects);
  const team = useTeamStore((state) => state.snapshot);
  const selectedId = useTeamStore((state) => state.selectedId);
  const select = useTeamStore((state) => state.select);
  const chat = chats.find((entry) => entry.id === activeChatId);
  const project = projects.find((entry) => entry.id === projectId);

  useEffect(
    () => useTeamStore.getState().watch(activeChatId ?? ""),
    [activeChatId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatNavbar
        title={chat?.title ?? "New chat"}
        projectName={project?.name ?? ""}
        members={team.members}
        selectedId={selectedId}
        onSelectMember={select}
        workMode={projectId !== ""}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          aria-label="Main conversation"
          className="min-h-0 min-w-0 flex-1"
        >
          <MainChatContent />
        </section>
        {projectId !== "" && <TeamPanel />}
      </div>
    </div>
  );
}

export default ChatScreen;
