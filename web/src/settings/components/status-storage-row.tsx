import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHardDrive } from "@fortawesome/free-solid-svg-icons";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { StatusStorage } from "@veykor/shared";
import { formatBytes } from "../status-format";

interface Props {
  storage: StatusStorage;
}

export function StatusStorageRow(props: Props) {
  const usage = props.storage.usagePercent;

  const variant = usage >= 90 ? "error" : usage >= 70 ? "warning" : "success";

  return (
    <VStack gap={3} padding={4} className="veykor-status-tile min-w-0">
      <HStack gap={2} vAlign="center">
        <FontAwesomeIcon
          icon={faHardDrive}
          size="sm"
          className="text-(--color-icon-secondary)"
          aria-hidden="true"
        />

        <Heading level={3} weight="semibold">
          Storage
        </Heading>
      </HStack>

      <ProgressBar
        label="Storage usage"
        isLabelHidden
        hasValueLabel
        value={usage}
        variant={variant}
      />

      <MetadataList>
        <MetadataListItem label="Used">
          {`${formatBytes(props.storage.usedBytes)} of ${formatBytes(props.storage.totalBytes)}`}
        </MetadataListItem>

        <MetadataListItem label="Free">
          {formatBytes(props.storage.freeBytes)}
        </MetadataListItem>

        <MetadataListItem label="Location">
          <Text type="code" color="secondary" maxLines={1}>
            {props.storage.path}
          </Text>
        </MetadataListItem>
      </MetadataList>
    </VStack>
  );
}
