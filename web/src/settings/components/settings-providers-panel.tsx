import { VStack } from "@astryxdesign/core/VStack";
import { ProviderCliList } from "./provider-cli-list";

export function SettingsProvidersPanel() {
  return (
    <VStack
      id="settings-panel-providers"
      gap={6}
      isScrollable
      className="min-h-0 flex-1 overscroll-contain"
    >
      <ProviderCliList />
    </VStack>
  );
}
