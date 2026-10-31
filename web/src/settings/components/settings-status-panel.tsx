import { useEffect } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/VStack";
import { useStatusStore } from "../status-store";
import { StatusCpuCard } from "./status-cpu-card";
import { StatusDatabaseCard } from "./status-database-card";
import { StatusMemoryCard } from "./status-memory-card";
import { StatusStorageCard } from "./status-storage-card";

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

      <Grid columns={{ minWidth: 280 }} gap={4}>
        <StatusDatabaseCard database={data.database} />

        <StatusCpuCard cpu={data.cpu} />

        <StatusMemoryCard memory={data.memory} />

        <StatusStorageCard storage={data.storage} />
      </Grid>
    </VStack>
  );
}
