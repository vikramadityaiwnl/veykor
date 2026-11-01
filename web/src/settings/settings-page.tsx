import { useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faHeartPulse, faPlug, faUser } from "@fortawesome/free-solid-svg-icons";
import { Selector } from "@astryxdesign/core/Selector";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { VStack } from "@astryxdesign/core/VStack";
import { WorkspacePageHeader } from "../workspace/components/workspace-page-header";
import { SettingsGeneralPanel } from "./components/settings-general-panel";
import { SettingsProvidersPanel } from "./components/settings-providers-panel";
import { SettingsStatusPanel } from "./components/settings-status-panel";
import { SettingsProfilePanel } from "./components/settings-profile-panel";

type SettingsTab = "general" | "providers" | "status" | "profile";

export function SettingsPage() {
  const [params, setParams] = useSearchParams();

  const rawTab = params.get("tab");

  const tab: SettingsTab =
    rawTab === "providers" || rawTab === "status" || rawTab === "profile"
      ? rawTab
      : "general";

  function changeTab(value: string) {
    if (value === "providers" || value === "status" || value === "profile") {
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

      <VStack className="shrink-0 md:hidden!">
        <Selector
          label="Settings section"
          isLabelHidden
          value={tab}
          onChange={changeTab}
          width="100%"
          options={[
            {
              value: "general",
              label: "General",
              icon: <FontAwesomeIcon icon={faGear} />,
            },
            {
              value: "providers",
              label: "Providers",
              icon: <FontAwesomeIcon icon={faPlug} />,
            },
            {
              value: "status",
              label: "Status",
              icon: <FontAwesomeIcon icon={faHeartPulse} />,
            },
            {
              value: "profile",
              label: "Profile",
              icon: <FontAwesomeIcon icon={faUser} />,
            },
          ]}
        />
      </VStack>
      <VStack className="hidden! shrink-0 md:flex!">
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
              <FontAwesomeIcon
                icon={faHeartPulse}
                size="sm"
                aria-hidden="true"
              />
            }
          />
          <Tab
            value="profile"
            label="Profile"
            panelId="settings-panel-profile"
            selectedIcon={<FontAwesomeIcon icon={faUser} />}
          />
        </TabList>
      </VStack>

      {tab === "general" ? (
        <SettingsGeneralPanel />
      ) : tab === "providers" ? (
        <SettingsProvidersPanel />
      ) : tab === "profile" ? (
        <SettingsProfilePanel />
      ) : (
        <SettingsStatusPanel />
      )}
    </VStack>
  );
}
