import { VStack } from "@astryxdesign/core/VStack";
import { ProviderCliGrid } from "./provider-cli-grid";

export function SettingsProvidersPanel() {
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
