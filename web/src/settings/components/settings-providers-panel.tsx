import { useEffect } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { useProvidersStore } from "../providers-store";
import { ProviderCliGrid } from "./provider-cli-grid";

export function SettingsProvidersPanel() {
  const loadCli = useProvidersStore((state) => state.loadCli);

  useEffect(() => {
    void loadCli();
  }, [loadCli]);

  return (
    <VStack
      id="settings-panel-providers"
      gap={6}
      isScrollable
      className="min-h-0 flex-1"
    >
      <ProviderCliGrid />
    </VStack>
  );
}
