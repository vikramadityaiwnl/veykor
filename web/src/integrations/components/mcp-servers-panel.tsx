import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlug } from "@fortawesome/free-solid-svg-icons";
import type { McpServer } from "@veykor/shared";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/VStack";
import { SettingsGroup } from "../../settings/components/settings-group";
import { useMcpServersStore } from "../mcp-servers-store";
import { McpServerDialog } from "./mcp-server-dialog";
import { McpServerRow } from "./mcp-server-row";

interface Props {
  panelId: string;
}

export function McpServersPanel(props: Props) {
  const servers = useMcpServersStore((state) => state.servers);
  const status = useMcpServersStore((state) => state.status);
  const testingId = useMcpServersStore((state) => state.testingId);
  const lastTest = useMcpServersStore((state) => state.lastTest);
  const load = useMcpServersStore((state) => state.load);
  const refresh = useMcpServersStore((state) => state.refresh);
  const update = useMcpServersStore((state) => state.update);
  const remove = useMcpServersStore((state) => state.remove);
  const testSaved = useMcpServersStore((state) => state.testSaved);
  const clearTest = useMcpServersStore((state) => state.clearTest);

  const [dialog, setDialog] = useState<{ server: McpServer | null } | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<McpServer | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(server: McpServer, enabled: boolean) {
    setError("");

    try {
      await update(server.id, { ...server, enabled });
    } catch {
      setError("Unable to update this MCP server. Please try again.");
    }
  }

  async function test(server: McpServer) {
    setError("");
    clearTest();

    try {
      await testSaved(server.id);
    } catch {
      setError("Unable to test this MCP server. Please try again.");
    }
  }

  function openDialog(server: McpServer | null) {
    clearTest();
    setDialog({ server });
  }

  async function confirmDelete(): Promise<boolean> {
    if (!pendingDelete) {
      return false;
    }

    try {
      await remove(pendingDelete.id);
      setPendingDelete(null);

      return true;
    } catch {
      setError("Unable to remove this MCP server. Please try again.");

      return false;
    }
  }

  if (status === "idle" || status === "loading") {
    return <Spinner label="Loading MCP servers…" />;
  }

  if (status === "error") {
    return (
      <VStack gap={2}>
        <Banner
          status="error"
          title="Couldn't load MCP servers"
          description="Please try again."
        />

        <Button
          label="Try again"
          clickAction={() => {
            void refresh();
          }}
        />
      </VStack>
    );
  }

  return (
    <VStack
      id={props.panelId}
      gap={4}
      isScrollable
      className="min-h-0 flex-1 overscroll-contain"
    >
      {servers.length > 0 ? (
        <HStack hAlign="end">
          <Button
            label="Add server"
            variant="primary"
            clickAction={() => openDialog(null)}
          />
        </HStack>
      ) : null}

      {error ? <Banner status="error" title={error} /> : null}

      {lastTest && testingId === "" && dialog === null ? (
        <Banner
          status={lastTest.ok ? "success" : "error"}
          title={
            lastTest.ok
              ? `Connected · ${lastTest.toolCount} tool${lastTest.toolCount === 1 ? "" : "s"}`
              : "Connection failed"
          }
          description={
            lastTest.ok
              ? lastTest.tools
                  .slice(0, 10)
                  .map((tool) => tool.name)
                  .join(", ") || "No tools advertised."
              : lastTest.error
          }
          isDismissable
          onDismiss={clearTest}
        />
      ) : null}

      {servers.length === 0 ? (
        <Center className="min-h-full shrink-0">
          <EmptyState
            title="No MCP servers yet"
            description="Connect a Model Context Protocol server to give your agents live tools and data."
            icon={
              <FontAwesomeIcon
                icon={faPlug}
                size="sm"
                className="size-(--spacing-10)! text-(--color-icon-secondary)"
                aria-hidden="true"
              />
            }
            actions={
              <Button
                label="Add server"
                variant="primary"
                clickAction={() => openDialog(null)}
              />
            }
          />
        </Center>
      ) : (
        <SettingsGroup>
          {servers.map((server) => (
            <McpServerRow
              key={server.id}
              server={server}
              isTesting={testingId === server.id}
              onToggle={(enabled) => {
                void toggle(server, enabled);
              }}
              onTest={() => {
                void test(server);
              }}
              onEdit={() => openDialog(server)}
              onDelete={() => setPendingDelete(server)}
            />
          ))}
        </SettingsGroup>
      )}

      {dialog ? (
        <McpServerDialog
          key={dialog.server?.id || "new"}
          server={dialog.server}
          isOpen
          onClose={() => {
            clearTest();
            setDialog(null);
          }}
        />
      ) : null}

      <AlertDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingDelete(null);
          }
        }}
        title={`Remove ${pendingDelete?.name || "server"}?`}
        description="This MCP server will stop being available to your agents."
        actionLabel="Remove"
        onAction={confirmDelete}
      />
    </VStack>
  );
}
