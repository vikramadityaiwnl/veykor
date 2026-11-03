import Divider from "../components/divider/divider.tsx";
import EmptyState from "../components/empty-state/empty-state.tsx";

interface Props {
  [key: string]: never;
}

function AgentsPage(_props: Props) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex w-full flex-1 flex-col space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">Agents</h1>

          <p className="text-sm font-light text-zinc-400">
            Build agents to automate your workflows.
          </p>
        </div>

        <Divider />

        <div className="grid flex-1 place-items-center">
          <EmptyState iconSize={56} title="No agents yet" />
        </div>
      </div>
    </div>
  );
}

export default AgentsPage;
