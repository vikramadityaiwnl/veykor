import { useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlug, faPuzzlePiece, faShapes, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { Selector } from "@astryxdesign/core/Selector";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { VStack } from "@astryxdesign/core/VStack";
import { WorkspacePageHeader } from "../workspace/components/workspace-page-header";
import { IntegrationsComingSoon } from "./components/integrations-coming-soon";
import { McpServersPanel } from "./components/mcp-servers-panel";
import { SkillsDetectedPanel } from "./components/skills-detected-panel";

type IntegrationsTab = "mcp" | "plugins" | "extensions" | "skills";

const iconClassName = "size-(--spacing-10)! text-(--color-icon-secondary)";

export function IntegrationsPage() {
  const [params, setParams] = useSearchParams();

  const rawTab = params.get("tab");

  const tab: IntegrationsTab =
    rawTab === "plugins" || rawTab === "extensions" || rawTab === "skills"
      ? rawTab
      : "mcp";

  function changeTab(value: string) {
    if (value === "plugins" || value === "extensions" || value === "skills") {
      setParams({ tab: value });
      return;
    }

    setParams({});
  }

  return (
    <VStack gap={4} padding={6} className="min-h-0 flex-1 overflow-hidden">
      <WorkspacePageHeader
        title="Integrations"
        description="Connect MCP servers, plugins, extensions, and skills to extend your veykor agents."
      />

      <VStack className="shrink-0 md:hidden!">
        <Selector
          label="Integrations section"
          isLabelHidden
          value={tab}
          onChange={changeTab}
          width="100%"
          options={[
            {
              value: "mcp",
              label: "MCP",
              icon: <FontAwesomeIcon icon={faPlug} />,
            },
            {
              value: "skills",
              label: "Skills",
              icon: <FontAwesomeIcon icon={faWandMagicSparkles} />,
            },
            {
              value: "plugins",
              label: "Plugins",
              icon: <FontAwesomeIcon icon={faPuzzlePiece} />,
            },
            {
              value: "extensions",
              label: "Extensions",
              icon: <FontAwesomeIcon icon={faShapes} />,
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
            value="mcp"
            label="MCP"
            panelId="integrations-panel-mcp"
            selectedIcon={
              <FontAwesomeIcon icon={faPlug} size="sm" aria-hidden="true" />
            }
          />

          <Tab
            value="skills"
            label="Skills"
            panelId="integrations-panel-skills"
            selectedIcon={
              <FontAwesomeIcon
                icon={faWandMagicSparkles}
                size="sm"
                aria-hidden="true"
              />
            }
          />

          <Tab
            value="plugins"
            label="Plugins"
            panelId="integrations-panel-plugins"
            selectedIcon={
              <FontAwesomeIcon
                icon={faPuzzlePiece}
                size="sm"
                aria-hidden="true"
              />
            }
          />

          <Tab
            value="extensions"
            label="Extensions"
            panelId="integrations-panel-extensions"
            selectedIcon={
              <FontAwesomeIcon icon={faShapes} size="sm" aria-hidden="true" />
            }
          />
        </TabList>
      </VStack>

      {tab === "mcp" ? (
        <McpServersPanel panelId="integrations-panel-mcp" />
      ) : tab === "skills" ? (
        <SkillsDetectedPanel panelId="integrations-panel-skills" />
      ) : tab === "plugins" ? (
        <IntegrationsComingSoon
          panelId="integrations-panel-plugins"
          title="Plugins are coming soon"
          description="Plugins will restyle and extend the veykor interface with new surfaces and workflows."
          icon={
            <FontAwesomeIcon
              icon={faPuzzlePiece}
              size="sm"
              className={iconClassName}
              aria-hidden="true"
            />
          }
        />
      ) : (
        <IntegrationsComingSoon
          panelId="integrations-panel-extensions"
          title="Extensions are coming soon"
          description="Extensions will add new capabilities to your workspace and agents."
          icon={
            <FontAwesomeIcon
              icon={faShapes}
              size="sm"
              className={iconClassName}
              aria-hidden="true"
            />
          }
        />
      )}
    </VStack>
  );
}
