import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { SettingsGroup } from "../../settings/components/settings-group";
import { useSkillsStore } from "../skills-store";
import { DetectedSkillRow } from "./detected-skill-row";
import { IntegrationsComingSoon } from "./integrations-coming-soon";

interface Props {
  panelId: string;
}

export function SkillsDetectedPanel(props: Props) {
  const sources = useSkillsStore((state) => state.sources);
  const status = useSkillsStore((state) => state.status);
  const load = useSkillsStore((state) => state.load);
  const refresh = useSkillsStore((state) => state.refresh);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "idle" || status === "loading") {
    return <Spinner label="Scanning for installed skills…" />;
  }

  if (status === "error") {
    return (
      <VStack gap={2}>
        <Banner
          status="error"
          title="Couldn't scan for installed skills"
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
    return (
      <IntegrationsComingSoon
        panelId={props.panelId}
        title="Skills are coming soon"
        description="Skills will bundle reusable instructions and tools your agents can call on."
        icon={
          <FontAwesomeIcon
            icon={faWandMagicSparkles}
            size="sm"
            className="size-(--spacing-10)! text-(--color-icon-secondary)"
            aria-hidden="true"
          />
        }
      />
    );
  }

  return (
    <VStack
      id={props.panelId}
      gap={4}
      isScrollable
      className="min-h-0 flex-1 overscroll-contain"
    >
      <Banner
        status="warning"
        title="Detected skills belong to other apps"
        description="These skills were found in other apps' folders on this host."
      />

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
            {source.skills.map((skill) => (
              <DetectedSkillRow key={skill.path} skill={skill} />
            ))}
          </SettingsGroup>
        </VStack>
      ))}
    </VStack>
  );
}
