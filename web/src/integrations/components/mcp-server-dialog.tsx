import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlug } from "@fortawesome/free-solid-svg-icons";
import type { CreateMcpServerInput, McpServer, McpTransport } from "@veykor/shared";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useMcpServersStore } from "../mcp-servers-store";
import { formatEnvRecord, formatHeaderRecord, parseArgLines, parseEnvLines, parseHeaderLines } from "../mcp-form";

interface Props {
  server: McpServer | null;
  isOpen: boolean;
  onClose: () => void;
}

export function McpServerDialog(props: Props) {
  const editing = props.server;

  const [name, setName] = useState(editing?.name || "");
  const [transport, setTransport] = useState<McpTransport>(
    editing?.transport || "stdio",
  );
  const [command, setCommand] = useState(editing?.command || "");
  const [argsText, setArgsText] = useState((editing?.args || []).join("\n"));
  const [envText, setEnvText] = useState(formatEnvRecord(editing?.env || {}));
  const [url, setUrl] = useState(editing?.url || "");
  const [headersText, setHeadersText] = useState(
    formatHeaderRecord(editing?.headers || {}),
  );
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const testingId = useMcpServersStore((state) => state.testingId);
  const lastTest = useMcpServersStore((state) => state.lastTest);
  const create = useMcpServersStore((state) => state.create);
  const update = useMcpServersStore((state) => state.update);
  const testDraft = useMcpServersStore((state) => state.testDraft);

  const isTesting = testingId === "draft";

  function draft(): CreateMcpServerInput {
    return {
      name: name.trim(),
      transport,
      command: command.trim(),
      args: parseArgLines(argsText),
      env: parseEnvLines(envText),
      url: url.trim(),
      headers: parseHeaderLines(headersText),
      enabled,
    };
  }

  function valid(): boolean {
    if (!name.trim()) {
      return false;
    }

    if (transport === "stdio") {
      return command.trim().length > 0;
    }

    try {
      const parsed = new URL(url.trim());

      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function save() {
    if (!valid() || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      if (editing) {
        await update(editing.id, draft());
      } else {
        await create(draft());
      }

      props.onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save this MCP server.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function test() {
    if (!valid() || isTesting) {
      return;
    }

    setError("");

    try {
      await testDraft(draft());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to test this MCP server.",
      );
    }
  }

  return (
    <Dialog
      isOpen={props.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          props.onClose();
        }
      }}
      purpose="form"
      width={520}
    >
      <Layout
        header={
          <DialogHeader
            title={editing ? "Edit MCP server" : "Add MCP server"}
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                props.onClose();
              }
            }}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <TextInput
                label="Name"
                value={name}
                onChange={setName}
                placeholder="e.g. Library docs"
                hasAutoFocus
              />

              <Selector
                label="Transport"
                value={transport}
                onChange={(value) => setTransport(value as McpTransport)}
                width="100%"
                options={[
                  {
                    value: "stdio",
                    label: "Command (stdio)",
                    icon: <FontAwesomeIcon icon={faPlug} />,
                  },
                  {
                    value: "http",
                    label: "HTTP streaming",
                    icon: <FontAwesomeIcon icon={faPlug} />,
                  },
                  {
                    value: "sse",
                    label: "SSE (legacy)",
                    icon: <FontAwesomeIcon icon={faPlug} />,
                  },
                ]}
              />

              {transport === "sse" ? (
                <Text color="secondary" type="supporting">
                  Legacy SSE servers can be tested here, but only stdio and HTTP
                  servers are available in chat.
                </Text>
              ) : null}

              {transport === "stdio" ? (
                <VStack gap={4}>
                  <TextInput
                    label="Command"
                    value={command}
                    onChange={setCommand}
                    placeholder="e.g. npx"
                  />

                  <TextArea
                    label="Arguments"
                    value={argsText}
                    onChange={setArgsText}
                    rows={3}
                    placeholder={
                      "One argument per line, e.g.\n-y\nmcp-server-package"
                    }
                  />

                  <TextArea
                    label="Environment"
                    value={envText}
                    onChange={setEnvText}
                    rows={2}
                    placeholder={"One variable per line, e.g.\nAPI_KEY=key"}
                  />
                </VStack>
              ) : (
                <VStack gap={4}>
                  <TextInput
                    label="Server URL"
                    value={url}
                    onChange={setUrl}
                    placeholder="https://example.com/mcp"
                  />

                  <TextArea
                    label="Headers"
                    value={headersText}
                    onChange={setHeadersText}
                    rows={2}
                    placeholder={
                      "One header per line, e.g.\nAuthorization: Bearer token"
                    }
                  />
                </VStack>
              )}

              <HStack gap={4} vAlign="center" justify="between">
                <VStack gap={1}>
                  <Text weight="semibold">Enabled</Text>

                  <Text color="secondary" type="supporting">
                    Disabled servers stay saved but are never connected.
                  </Text>
                </VStack>

                <Switch
                  label="Enable this MCP server"
                  isLabelHidden
                  value={enabled}
                  onChange={setEnabled}
                />
              </HStack>

              {lastTest ? (
                <Banner
                  status={lastTest.ok ? "success" : "error"}
                  title={
                    lastTest.ok
                      ? `Connected · ${lastTest.toolCount} tool${lastTest.toolCount === 1 ? "" : "s"}`
                      : "Connection failed"
                  }
                  description={
                    lastTest.ok
                      ? lastTest.tools
                          .slice(0, 8)
                          .map((tool) => tool.name)
                          .join(", ") || "No tools advertised."
                      : lastTest.error
                  }
                />
              ) : null}

              {error ? <Banner status="error" title={error} /> : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end" wrap="wrap">
              <Button
                label={isTesting ? "Testing…" : "Test"}
                variant="secondary"
                isDisabled={!valid() || isTesting || isSaving}
                clickAction={test}
              />

              <Button
                label="Cancel"
                variant="ghost"
                clickAction={props.onClose}
              />

              <Button
                label={editing ? "Save" : "Add"}
                variant="primary"
                isDisabled={!valid()}
                isLoading={isSaving}
                clickAction={save}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
