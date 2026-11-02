import { useEffect, useState } from "react";
import type { McpDetectedServer } from "@veykor/shared";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { SettingsGroup } from "../../settings/components/settings-group";
import { detectedActionKey, useMcpDetectedStore } from "../mcp-detected-store";
import { McpDetectedRow } from "./mcp-detected-row";

interface PendingDelete {
  sourceId: string;
  sourceLabel: string;
  server: McpDetectedServer;
}

export function McpDetectedSection() {
  const sources = useMcpDetectedStore((state) => state.sources);
  const status = useMcpDetectedStore((state) => state.status);
  const busyKey = useMcpDetectedStore((state) => state.busyKey);
  const error = useMcpDetectedStore((state) => state.error);
  const lastTest = useMcpDetectedStore((state) => state.lastTest);
  const load = useMcpDetectedStore((state) => state.load);
  const refresh = useMcpDetectedStore((state) => state.refresh);
  const testServer = useMcpDetectedStore((state) => state.testServer);
  const removeServer = useMcpDetectedStore((state) => state.removeServer);
  const clearError = useMcpDetectedStore((state) => state.clearError);
  const clearTest = useMcpDetectedStore((state) => state.clearTest);

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete(): Promise<boolean> {
    if (!pendingDelete) {
      return false;
    }

    const removed = await removeServer(
      pendingDelete.sourceId,
      pendingDelete.server.key,
    );

    if (removed) {
      setPendingDelete(null);
    }

    return removed;
  }

  if (status === "idle" || status === "loading") {
    return <Spinner label="Scanning for installed servers…" />;
  }

  if (status === "error") {
    return (
      <VStack gap={2} className="shrink-0">
        <Banner
          status="error"
          title="Couldn't scan for installed servers"
          description="Please try again."
        />

        <HStack hAlign="start">
          <Button
            label="Try again"
            clickAction={() => {
              void refresh();
            }}
          />
        </HStack>
      </VStack>
    );
  }

  if (sources.length === 0) {
    return null;
  }

  return (
    <VStack gap={4} className="shrink-0">
      {error ? (
        <Banner
          status="error"
          title={error}
          isDismissable
          onDismiss={clearError}
        />
      ) : null}

      {lastTest && busyKey === "" ? (
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

      {sources.map((source) => (
        <VStack key={source.id} gap={2} className="shrink-0">
          <VStack gap={1}>
            <Heading level={3} weight="semibold">
              {source.label}
            </Heading>

            <Text type="supporting" color="secondary" maxLines={1}>
              {source.path}
            </Text>
          </VStack>

          <SettingsGroup>
            {source.servers.map((server) => (
              <McpDetectedRow
                key={server.key}
                server={server}
                isBusy={busyKey !== ""}
                isTesting={busyKey === detectedActionKey(source.id, server.key)}
                onTest={() => {
                  void testServer(source.id, server.key);
                }}
                onRemove={() =>
                  setPendingDelete({
                    sourceId: source.id,
                    sourceLabel: source.label,
                    server,
                  })
                }
              />
            ))}
          </SettingsGroup>
        </VStack>
      ))}

      <AlertDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingDelete(null);
          }
        }}
        title={`Delete ${pendingDelete?.server.name || "server"} from ${pendingDelete?.sourceLabel || "its source"}?`}
        description="This removes the server from its config file. veykor keeps a backup beside the original."
        actionLabel="Delete"
        onAction={confirmDelete}
      />
    </VStack>
  );
}
