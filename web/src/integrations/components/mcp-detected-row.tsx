import type { McpDetectedServer } from "@veykor/shared";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  server: McpDetectedServer;
  isBusy: boolean;
  onImport: () => void;
  onRemove: () => void;
}

export function McpDetectedRow(props: Props) {
  const server = props.server;

  const detail =
    server.transport === "stdio"
      ? [server.command, ...server.args].filter(Boolean).join(" ")
      : server.url;

  return (
    <HStack gap={4} vAlign="center" justify="between" wrap="wrap" padding={4}>
      <VStack gap={2} className="min-w-0 flex-1">
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Heading level={3} weight="semibold">
            {server.name}
          </Heading>

          <Text type="supporting" color="secondary">
            {server.transport === "stdio"
              ? "stdio"
              : server.transport === "sse"
                ? "SSE"
                : "HTTP"}
          </Text>
        </HStack>

        {detail ? (
          <Text type="supporting" color="secondary" maxLines={1}>
            {detail}
          </Text>
        ) : null}

        {server.imported ? (
          <HStack gap={2} vAlign="center">
            <StatusDot variant="success" label="Imported into veykor" />

            <Text type="supporting" color="secondary">
              Imported
            </Text>
          </HStack>
        ) : null}
      </VStack>

      <HStack gap={3} vAlign="center" wrap="wrap">
        {server.imported ? null : (
          <Button
            label={props.isBusy ? "Importing…" : "Import"}
            variant="secondary"
            size="sm"
            isDisabled={props.isBusy}
            clickAction={props.onImport}
          />
        )}

        <Button
          label="Delete"
          variant="ghost"
          size="sm"
          isDisabled={props.isBusy}
          clickAction={props.onRemove}
        />
      </HStack>
    </HStack>
  );
}
