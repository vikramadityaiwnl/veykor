import {
  EllipsisHorizontalIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { McpServerSummary } from "@veykor/shared";
import { mcpTransports } from "@veykor/shared";
import Badge from "../../components/badge/badge.tsx";
import Dropdown from "../../components/dropdown/dropdown.tsx";
import EmptyState from "../../components/empty-state/empty-state.tsx";
import { semanticColors } from "../../theme/semantic-colors.ts";

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
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 flex-1 truncate font-semibold">
                {server.name}
              </h2>

              <div
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Dropdown
                  label={`Actions for ${server.name}`}
                  trigger={
                    <EllipsisHorizontalIcon
                      aria-hidden="true"
                      className="size-5"
                    />
                  }
                  triggerClassName="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                  items={[
                    {
                      kind: "item",
                      id: "edit",
                      label: "Edit",
                      icon: (
                        <PencilIcon
                          aria-hidden="true"
                          className="size-4 text-zinc-400"
                        />
                      ),
                      onSelect: () => props.onEdit(server),
                    },
                    {
                      kind: "item",
                      id: "toggle",
                      label: server.enabled ? "Disable" : "Enable",
                      icon: (
                        <PowerIcon
                          aria-hidden="true"
                          className="size-4 text-zinc-400"
                        />
                      ),
                      onSelect: () => props.onToggle(server),
                    },
                    { kind: "divider", id: "delete-divider" },
                    {
                      kind: "item",
                      id: "delete",
                      label: "Delete",
                      icon: (
                        <TrashIcon
                          aria-hidden="true"
                          className={`size-4 ${semanticColors.delete.text}`}
                        />
                      ),
                      danger: true,
                      onSelect: () => props.onDelete(server),
                    },
                  ]}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge text={transportTitle(server)} />

              <Badge
                text={server.enabled ? "Enabled" : "Disabled"}
                tone={server.enabled ? "success" : "danger"}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default McpServerList;
