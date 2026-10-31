import { useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faPlug } from "@fortawesome/free-solid-svg-icons";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { VStack } from "@astryxdesign/core/VStack";
import { WorkspacePageHeader } from "../workspace/components/workspace-page-header";
import { SettingsGeneralPanel } from "./components/settings-general-panel";
import { SettingsProvidersPanel } from "./components/settings-providers-panel";

const headers: Record<string, { title: string; description: string }> = {
  general: {
    title: "General settings",
    description:
      "Workspace preferences that apply to every project and chat session in veykor. These are the defaults everything else builds on.",
  },
  providers: {
    title: "Providers",
    description:
      "The command-line AI tools veykor can use for chat, detected on this host with their installed versions.",
  },
};

export function SettingsPage() {
  const [params, setParams] = useSearchParams();

  const tab = params.get("tab") === "providers" ? "providers" : "general";

  const header = headers[tab];

  function changeTab(value: string) {
    if (value === "providers") {
      setParams({ tab: "providers" });
      return;
    }

    setParams({});
  }

  return (
    <VStack gap={4} padding={6} className="min-h-0 flex-1 overflow-hidden">
      <WorkspacePageHeader
        title={header.title}
        description={header.description}
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
      </TabList>

      {tab === "general" ? (
        <SettingsGeneralPanel />
      ) : (
        <SettingsProvidersPanel />
      )}
    </VStack>
  );
}
