import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDatabase } from "@fortawesome/free-solid-svg-icons";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { StatusDatabase } from "@veykor/shared";
import { formatBytes, formatLatency } from "../status-format";

interface Props {
  database: StatusDatabase;
}

export function StatusDatabaseCard(props: Props) {
  const connected = props.database.status === "connected";
  const label = connected ? "Connected" : "Disconnected";

  return (
    <Card elevation="none">
      <VStack gap={3}>
        <HStack gap={2} vAlign="center">
          <FontAwesomeIcon
            icon={faDatabase}
            size="sm"
            className="text-(--color-icon-secondary)"
            aria-hidden="true"
          />

          <Heading level={3} weight="semibold">
            Database
          </Heading>
        </HStack>

        <HStack gap={2} vAlign="center">
          <StatusDot variant={connected ? "success" : "error"} label={label} />

          <Text>{label}</Text>
        </HStack>

        <MetadataList>
          <MetadataListItem label="Latency">
            {formatLatency(props.database.latencyMs)}
          </MetadataListItem>

          <MetadataListItem label="Size on disk">
            {formatBytes(props.database.sizeBytes)}
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </Card>
  );
}
