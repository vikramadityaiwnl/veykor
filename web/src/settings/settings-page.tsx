import { useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faHeartPulse, faPlug } from "@fortawesome/free-solid-svg-icons";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { VStack } from "@astryxdesign/core/VStack";
import { WorkspacePageHeader } from "../workspace/components/workspace-page-header";
import { SettingsGeneralPanel } from "./components/settings-general-panel";
import { SettingsProvidersPanel } from "./components/settings-providers-panel";
import { SettingsStatusPanel } from "./components/settings-status-panel";

type SettingsTab = "general" | "providers" | "status";

export function SettingsPage() {
  const [params, setParams] = useSearchParams();

  const rawTab = params.get("tab");

  const tab: SettingsTab =
    rawTab === "providers" || rawTab === "status" ? rawTab : "general";

  function changeTab(value: string) {
    if (value === "providers" || value === "status") {
      setParams({ tab: value });
      return;
    }

    setParams({});
  }

  return (
    <VStack gap={4} padding={6} className="min-h-0 flex-1 overflow-hidden">
      <WorkspacePageHeader
        title="Settings"
        description="Workspace preferences, provider tools, and host status for this veykor server."
      />

      <TabList
        value={tab}
        onChange={changeTab}
        role="tablist"
        hasDivider
        className="shrink-0"
      >
        <Tab
          value="general"
          label="General"
          panelId="settings-panel-general"
          selectedIcon={
            <FontAwesomeIcon icon={faGear} size="sm" aria-hidden="true" />
          }
        />

        <Tab
          value="providers"
          label="Providers"
          panelId="settings-panel-providers"
          selectedIcon={
            <FontAwesomeIcon icon={faPlug} size="sm" aria-hidden="true" />
          }
        />

        <Tab
          value="status"
          label="Status"
          panelId="settings-panel-status"
          selectedIcon={
            <FontAwesomeIcon icon={faHeartPulse} size="sm" aria-hidden="true" />
          }
        />
      </TabList>

      {tab === "general" ? (
        <SettingsGeneralPanel />
      ) : tab === "providers" ? (
        <SettingsProvidersPanel />
      ) : (
        <SettingsStatusPanel />
      )}
    </VStack>
  );
}
