import type { McpDetectedServer } from "@veykor/shared";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  server: McpDetectedServer;
  isBusy: boolean;
  isTesting: boolean;
  onTest: () => void;
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
      </VStack>

      <HStack gap={3} vAlign="center" wrap="wrap">
        <Button
          label={props.isTesting ? "Testing…" : "Test"}
          variant="secondary"
          size="sm"
          isDisabled={props.isBusy}
          clickAction={props.onTest}
        />

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
