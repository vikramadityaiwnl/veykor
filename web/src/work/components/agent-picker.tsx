import AgentAvatar from "../../agents/components/agent-avatar.tsx";
import Selector from "../../components/selector/selector.tsx";
import { useChatStore } from "../../chat/chat-store.ts";
import { useWorkStore } from "../work-store.ts";

function AgentPicker() {
  const { agents, projects, projectId, agentId, selectAgent } = useWorkStore();
  const activeChatId = useChatStore((state) => state.activeChatId);
  const chat = useChatStore((state) =>
    state.chats.find((entry) => entry.id === activeChatId),
  );
  const project = projects.find((entry) => entry.id === projectId);
  const assigned = agents.filter((agent) =>
    project?.agentIds.includes(agent.id),
  );

  return (
    <Selector
      label="Agent"
      variant="composer"
      disabled={!project || activeChatId !== null}
      value={activeChatId ? (chat?.agentId ?? "") : agentId}
      options={
        activeChatId
          ? [
              {
                value: chat?.agentId ?? "",
                label: chat?.agentName ?? "Agent",
                icon: <AgentAvatar name={chat?.agentName ?? ""} size={24} />,
              },
            ]
          : [
              { value: "", label: "Select agent" },
              ...assigned.map((agent) => ({
                value: agent.id,
                label: agent.name,
                icon: <AgentAvatar name={agent.name} size={24} />,
              })),
            ]
      }
      onChange={selectAgent}
    />
  );
}

export default AgentPicker;
