import { ServerStackIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type {
  McpServerSummary,
  SkillDetail,
  SkillSummary,
} from "@veykor/shared";
import AlertDialog from "../components/alert-dialog/alert-dialog.tsx";
import McpServerDialog from "./components/mcp-server-dialog.tsx";
import McpServerList from "./components/mcp-server-list.tsx";
import SkillDialog from "./components/skill-dialog.tsx";
import SkillList from "./components/skill-list.tsx";
import Tabs from "../components/tabs/tabs.tsx";
import { useIntegrationsStore } from "./integrations-store.ts";
import {
  deleteMcpServer,
  deleteSkill,
  fetchSkill,
  updateMcpServer,
  updateSkill,
} from "./integrations-client.ts";

type IntegrationsTab = "mcp" | "skills";

function IntegrationsPage() {
  const servers = useIntegrationsStore((state) => state.servers);
  const skills = useIntegrationsStore((state) => state.skills);
  const stdioAllowed = useIntegrationsStore((state) => state.stdioAllowed);
  const error = useIntegrationsStore((state) => state.error);
  const load = useIntegrationsStore((state) => state.load);
  const [tab, setTab] = useState<IntegrationsTab>("mcp");
  const [editing, setEditing] = useState<McpServerSummary | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<McpServerSummary | null>(null);
  const [editingSkill, setEditingSkill] = useState<
    SkillDetail | null | undefined
  >(undefined);
  const [deletingSkill, setDeletingSkill] = useState<SkillSummary | null>(null);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleEnabled(server: McpServerSummary) {
    setFailure("");

    try {
      await updateMcpServer(server.id, { enabled: !server.enabled });
      await load();
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Unable to update the server.",
      );
    }
  }

  async function remove() {
    if (!deleting) {
      return;
    }

    try {
      await deleteMcpServer(deleting.id);
      setDeleting(null);
      await load();
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Unable to delete the server.",
      );
      setDeleting(null);
    }
  }

  async function editSkill(skill: SkillSummary) {
    setFailure("");

    try {
      setEditingSkill(await fetchSkill(skill.id));
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Unable to open the skill.",
      );
    }
  }

  async function toggleSkill(skill: SkillSummary) {
    setFailure("");

    try {
      await updateSkill(skill.id, { enabled: !skill.enabled });
      await load();
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Unable to update the skill.",
      );
    }
  }

  async function removeSkill() {
    if (!deletingSkill) {
      return;
    }

    try {
      await deleteSkill(deletingSkill.id);
      setDeletingSkill(null);
      await load();
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Unable to delete the skill.",
      );
      setDeletingSkill(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">Integrations</h1>

          <p className="text-sm font-light text-zinc-400">
            Connect veykor to external tools and data.
          </p>
        </div>

        <Tabs
          label="Integration type"
          onChange={setTab}
          options={[
            {
              icon: <ServerStackIcon aria-hidden="true" className="size-4" />,
              label: "MCP",
              value: "mcp",
            },
            {
              icon: <SparklesIcon aria-hidden="true" className="size-4" />,
              label: "Skills",
              value: "skills",
            },
          ]}
          value={tab}
        />

        {(error || failure) && (
          <p role="alert" className="text-sm text-rose-400">
            {error || failure}
          </p>
        )}

        {tab === "mcp" ? (
          <McpServerList
            onAdd={() => setEditing(null)}
            onDelete={setDeleting}
            onEdit={setEditing}
            onToggle={(server) => void toggleEnabled(server)}
            servers={servers}
          />
        ) : (
          <SkillList
            onAdd={() => setEditingSkill(null)}
            onDelete={setDeletingSkill}
            onEdit={(skill) => void editSkill(skill)}
            onToggle={(skill) => void toggleSkill(skill)}
            skills={skills}
          />
        )}

        {editing !== undefined && (
          <McpServerDialog
            onClose={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              void load();
            }}
            server={editing}
            stdioAllowed={stdioAllowed}
          />
        )}

        {deleting && (
          <AlertDialog
            title="Delete server"
            description={`Remove ${deleting.name}? Existing chats keep their saved configuration, but chats that need its secrets will fail to open.`}
            confirmLabel="Delete"
            onClose={() => setDeleting(null)}
            onConfirm={() => void remove()}
          />
        )}

        {editingSkill !== undefined && (
          <SkillDialog
            onClose={() => setEditingSkill(undefined)}
            onSaved={() => {
              setEditingSkill(undefined);
              void load();
            }}
            skill={editingSkill}
          />
        )}

        {deletingSkill && (
          <AlertDialog
            title="Delete skill"
            description={`Remove ${deletingSkill.name}? New chats will no longer see it.`}
            confirmLabel="Delete"
            onClose={() => setDeletingSkill(null)}
            onConfirm={() => void removeSkill()}
          />
        )}
      </div>
    </div>
  );
}

export default IntegrationsPage;
