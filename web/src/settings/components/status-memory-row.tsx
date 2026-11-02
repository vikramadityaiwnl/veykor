import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMemory } from "@fortawesome/free-solid-svg-icons";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { VStack } from "@astryxdesign/core/VStack";
import type { StatusMemory } from "@veykor/shared";
import { formatBytes } from "../status-format";

interface Props {
  memory: StatusMemory;
}

export function StatusMemoryRow(props: Props) {
  const usage = props.memory.usagePercent;

  const variant = usage >= 90 ? "error" : usage >= 70 ? "warning" : "success";

  return (
    <VStack gap={3} padding={4} className="veykor-status-tile min-w-0">
      <HStack gap={2} vAlign="center">
        <FontAwesomeIcon
          icon={faMemory}
          size="sm"
          className="text-(--color-icon-secondary)"
          aria-hidden="true"
        />

        <Heading level={3} weight="semibold">
          Memory
        </Heading>
      </HStack>

      <ProgressBar
        label="Memory usage"
        isLabelHidden
        hasValueLabel
        value={usage}
        variant={variant}
      />

      <MetadataList>
        <MetadataListItem label="Used">
          {`${formatBytes(props.memory.usedBytes)} of ${formatBytes(props.memory.totalBytes)}`}
        </MetadataListItem>

        <MetadataListItem label="Available">
          {formatBytes(props.memory.freeBytes)}
        </MetadataListItem>
      </MetadataList>
    </VStack>
  );
}
