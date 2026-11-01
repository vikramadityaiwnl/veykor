import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrochip } from "@fortawesome/free-solid-svg-icons";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { VStack } from "@astryxdesign/core/VStack";
import type { StatusCpu } from "@veykor/shared";

interface Props {
  cpu: StatusCpu;
}

export function StatusCpuRow(props: Props) {
  const usage = props.cpu.usagePercent;

  const variant = usage >= 90 ? "error" : usage >= 70 ? "warning" : "success";

  const loadAverage =
    props.cpu.loadAverage.map((value) => value.toFixed(2)).join(", ") ||
    "Unknown";

  return (
    <VStack gap={3} padding={4} className="veykor-status-tile min-w-0">
      <HStack gap={2} vAlign="center">
        <FontAwesomeIcon
          icon={faMicrochip}
          size="sm"
          className="text-(--color-icon-secondary)"
          aria-hidden="true"
        />

        <Heading level={3} weight="semibold">
          CPU
        </Heading>
      </HStack>

      <ProgressBar
        label="CPU usage"
        isLabelHidden
        hasValueLabel
        value={usage}
        variant={variant}
      />

      <MetadataList>
        <MetadataListItem label="Cores">
          {String(props.cpu.cores)}
        </MetadataListItem>

        <MetadataListItem label="Model">
          {props.cpu.model || "Unknown"}
        </MetadataListItem>

        <MetadataListItem label="Load average">{loadAverage}</MetadataListItem>
      </MetadataList>
    </VStack>
  );
}
