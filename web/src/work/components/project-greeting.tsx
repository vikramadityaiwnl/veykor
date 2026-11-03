import { useState } from "react";
import Logo from "../../components/logo/logo.tsx";
import Divider from "../../components/divider/divider.tsx";
import ProjectDialog from "./project-dialog.tsx";
import AgentAvatar from "../../agents/components/agent-avatar.tsx";
import { useWorkStore } from "../work-store.ts";
import { workGreetingFor } from "../work-greeting-titles.ts";

function ProjectGreeting() {
  const { projects, agents, projectId, selectAgent, agentId } = useWorkStore();
  const [editing, setEditing] = useState(false);
  const [greetingTime] = useState(() => new Date());
  const project = projects.find((entry) => entry.id === projectId);
  const assigned = agents.filter((agent) =>
    project?.agentIds.includes(agent.id),
  );

  return (
    <div className="w-full max-w-xl space-y-6 text-center">
      <div className="flex justify-center opacity-40">
        <Logo size={96} />
      </div>
      <h1 className="text-2xl font-semibold">
        {project
          ? workGreetingFor(greetingTime, project.name)
          : "Loading project…"}
      </h1>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {assigned.map((agent) => (
          <button
            key={agent.id}
            aria-label={`Select ${agent.name}`}
            title={agent.name}
            aria-pressed={agentId === agent.id}
            className={`rounded-full p-0.5 ring-1 ${agentId === agent.id ? "ring-zinc-400" : "ring-transparent hover:ring-zinc-700"}`}
            onClick={() => selectAgent(agent.id)}
          >
            <AgentAvatar name={agent.name} />
          </button>
        ))}
        {assigned.length > 0 && <Divider orientation="vertical" />}
        {project && (
          <button
            className="px-1 py-2 text-sm font-light text-zinc-400 hover:text-zinc-50"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>
      {editing && project && (
        <ProjectDialog
          project={project}
          sectionId={project.sectionId}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void useWorkStore.getState().load();
          }}
        />
      )}
      {project && assigned.length === 0 && (
        <p className="text-sm font-light text-zinc-500">
          Edit this project to assign agents before starting a session.
        </p>
      )}
    </div>
  );
}

export default ProjectGreeting;
