import type { McpServer } from "@veykor/shared";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  server: McpServer;
  isTesting: boolean;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function statusLabel(server: McpServer): string {
  if (server.status === "connected") {
    return server.toolCount === 1
      ? "Connected · 1 tool"
      : `Connected · ${server.toolCount} tools`;
  }

  if (server.status === "error") {
    return "Connection failed";
  }

  return "Not tested yet";
}

export function McpServerRow(props: Props) {
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

        <HStack gap={2} vAlign="center">
          <StatusDot
            variant={
              server.status === "connected"
                ? "success"
                : server.status === "error"
                  ? "error"
                  : "neutral"
            }
            label={statusLabel(server)}
          />

          <Text type="supporting" color="secondary">
            {statusLabel(server)}
          </Text>
        </HStack>

        {server.status === "error" && server.lastError ? (
          <Text type="supporting" color="secondary" maxLines={2}>
            {server.lastError}
          </Text>
        ) : null}
      </VStack>

      <HStack gap={3} vAlign="center" wrap="wrap">
        <Switch
          label={`Enable ${server.name}`}
          isLabelHidden
          value={server.enabled}
          onChange={props.onToggle}
        />

        <Button
          label={props.isTesting ? "Testing…" : "Test"}
          variant="secondary"
          size="sm"
          isDisabled={props.isTesting}
          clickAction={props.onTest}
        />

        <Button
          label="Edit"
          variant="ghost"
          size="sm"
          clickAction={props.onEdit}
        />

        <Button
          label="Remove"
          variant="ghost"
          size="sm"
          clickAction={props.onDelete}
        />
      </HStack>
    </HStack>
  );
}
