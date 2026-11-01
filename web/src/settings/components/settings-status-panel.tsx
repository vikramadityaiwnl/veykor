import { Grid } from "@astryxdesign/core/Grid";
import { useEffect } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { SettingsGroup } from "./settings-group";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/VStack";
import { useStatusStore } from "../status-store";
import { StatusCpuRow } from "./status-cpu-row";
import { StatusDatabaseRow } from "./status-database-row";
import { StatusMemoryRow } from "./status-memory-row";
import { StatusStorageRow } from "./status-storage-row";

const refreshIntervalMs = 10_000;

export function SettingsStatusPanel() {
  const data = useStatusStore((state) => state.data);
  const loadState = useStatusStore((state) => state.loadState);
  const error = useStatusStore((state) => state.error);
  const loadStatus = useStatusStore((state) => state.load);

  useEffect(() => {
    void loadStatus();

    const timer = setInterval(() => {
      void loadStatus();
    }, refreshIntervalMs);

    return () => clearInterval(timer);
  }, [loadStatus]);

  if (loadState === "error") {
    return (
      <VStack
        id="settings-panel-status"
        gap={2}
        isScrollable
        className="min-h-0 flex-1 overscroll-contain"
      >
        <Banner status="error" title="Status unavailable" description={error} />

        <Button
          label="Try again"
          clickAction={() => {
            void loadStatus();
          }}
        />
      </VStack>
    );
  }

  if (!data) {
    return (
      <VStack
        id="settings-panel-status"
        isScrollable
        className="min-h-0 flex-1 overscroll-contain"
      >
        <Spinner label="Checking host status…" />
      </VStack>
    );
  }

  return (
    <VStack
      id="settings-panel-status"
      gap={4}
      isScrollable
      className="min-h-0 flex-1 overscroll-contain"
    >
      {error ? (
        <Banner status="error" title="Refresh failed" description={error} />
      ) : null}

      <SettingsGroup>
        <Grid columns={2} gap={0} className="veykor-status-grid">
          <StatusDatabaseRow database={data.database} />
          <StatusCpuRow cpu={data.cpu} />
          <StatusMemoryRow memory={data.memory} />
          <StatusStorageRow storage={data.storage} />
        </Grid>
      </SettingsGroup>
    </VStack>
  );
}
