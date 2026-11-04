import { PlusIcon } from "@heroicons/react/24/outline";
import type { McpServerSummary } from "@veykor/shared";
import { mcpTransports } from "@veykor/shared";
import Badge from "../../components/badge/badge.tsx";
import EmptyState from "../../components/empty-state/empty-state.tsx";

interface Props {
  onAdd: () => void;
  onDelete: (server: McpServerSummary) => void;
  onEdit: (server: McpServerSummary) => void;
  onToggle: (server: McpServerSummary) => void;
  servers: Array<McpServerSummary>;
}

function transportTitle(server: McpServerSummary): string {
  return (
    mcpTransports.find((entry) => entry.value === server.transport)?.title ??
    server.transport
  );
}

function McpServerList(props: Props) {
  if (props.servers.length === 0) {
    return (
      <div className="py-16">
        <EmptyState
          actionLabel="Add MCP"
          description="Connect your first MCP server to give chats new tools."
          framedIcon={false}
          iconSize={40}
          onAction={props.onAdd}
          title="No MCP servers yet"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button
          aria-label="Add MCP server"
          className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-zinc-700 transition hover:bg-zinc-900"
          onClick={props.onAdd}
          type="button"
        >
          <EmptyState
            icon={
              <PlusIcon aria-hidden="true" className="size-5 text-zinc-500" />
            }
            title="Add MCP"
          />
        </button>

        {props.servers.map((server) => (
          <div
            key={server.id}
            className="cursor-pointer space-y-3 rounded-2xl border border-zinc-800 p-4 transition hover:border-zinc-700"
            onClick={() => props.onEdit(server)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                props.onEdit(server);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <h2 className="truncate font-semibold">{server.name}</h2>

            <div className="flex items-center gap-2">
              <Badge text={transportTitle(server)} />

              <Badge
                text={server.enabled ? "Enabled" : "Disabled"}
                tone={server.enabled ? "success" : "danger"}
              />
            </div>

            <div className="flex gap-4 text-xs">
              <button
                className={
                  server.enabled
                    ? "text-zinc-500 hover:text-rose-400"
                    : "text-zinc-500 hover:text-emerald-400"
                }
                onClick={(event) => {
                  event.stopPropagation();
                  props.onToggle(server);
                }}
              >
                {server.enabled ? "Disable" : "Enable"}
              </button>

              <button
                className="text-zinc-500 hover:text-rose-400"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onDelete(server);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default McpServerList;
