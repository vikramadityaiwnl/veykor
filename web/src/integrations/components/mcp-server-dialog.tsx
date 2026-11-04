import { CommandLineIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type {
  CreateMcpServerRequest,
  McpSecretPatch,
  McpServerSummary,
  McpTransport,
  UpdateMcpServerRequest,
} from "@veykor/shared";
import { mcpTransports } from "@veykor/shared";
import ArgumentList from "./argument-list.tsx";
import Dialog from "../../components/dialog/dialog.tsx";
import SecretList from "./secret-list.tsx";
import type { SecretRow } from "../secret-rows.ts";
import { buildSecretPatch, secretRowsError } from "../secret-rows.ts";
import SegmentedControl from "../../components/segmented-control/segmented-control.tsx";
import Selector from "../../components/selector/selector.tsx";
import {
  createMcpServer,
  createValidationError,
  updateMcpServer,
  updateValidationError,
} from "../integrations-client.ts";

interface Props {
  onClose: () => void;
  onSaved: () => void;
  server: McpServerSummary | null;
  stdioAllowed: boolean;
}

const fieldClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40";

function initialSecrets(names: Array<string>): Array<SecretRow> {
  return names.map((name) => ({
    id: crypto.randomUUID(),
    name,
    value: "",
    savedName: name,
  }));
}

function transportIcon(transport: McpTransport) {
  return transport === "stdio" ? (
    <CommandLineIcon aria-hidden="true" className="size-4 text-zinc-400" />
  ) : (
    <GlobeAltIcon aria-hidden="true" className="size-4 text-zinc-400" />
  );
}

function McpServerDialog(props: Props) {
  const creating = props.server === null;

  const [name, setName] = useState(props.server?.name ?? "");
  const [transport, setTransport] = useState<McpTransport>(
    props.server?.transport ?? (props.stdioAllowed ? "stdio" : "http"),
  );
  const [enabled, setEnabled] = useState(props.server?.enabled ?? true);
  const [command, setCommand] = useState(props.server?.command ?? "");
  const [args, setArgs] = useState<Array<string>>(props.server?.args ?? []);
  const [url, setUrl] = useState(props.server?.url ?? "");
  const [secrets, setSecrets] = useState<Array<SecretRow>>(
    initialSecrets(
      props.server?.transport === "http"
        ? (props.server?.headerNames ?? [])
        : (props.server?.envKeys ?? []),
    ),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const storedTransport = props.server?.transport;
  const switched = !creating && transport !== storedTransport;
  const stdioEditable = props.stdioAllowed;
  const secretKind = transport === "http" ? "headers" : "env";
  const transportChoices =
    creating && !props.stdioAllowed
      ? mcpTransports.filter((entry) => entry.value === "http")
      : mcpTransports;

  function handleTransportChange(value: string) {
    const next = value as McpTransport;

    setTransport(next);
    setSecrets(
      !creating && next === storedTransport
        ? initialSecrets(
            next === "http"
              ? (props.server?.headerNames ?? [])
              : (props.server?.envKeys ?? []),
          )
        : [],
    );
  }

  function secretPatch(): McpSecretPatch {
    const initial =
      !creating && !switched
        ? storedTransport === "http"
          ? (props.server?.headerNames ?? [])
          : (props.server?.envKeys ?? [])
        : [];

    return buildSecretPatch(initial, secrets);
  }

  async function save() {
    const rowsError = secretRowsError(secretKind, secrets);

    if (rowsError !== "") {
      setError(rowsError);
      return;
    }

    if (creating) {
      const patch = secretPatch();
      const secrets: Record<string, string> = {};

      for (const [key, value] of Object.entries(patch)) {
        if (value !== null) {
          secrets[key] = value;
        }
      }

      const input: CreateMcpServerRequest = {
        name,
        transport,
        enabled,
        mode: "optional",
        ...(transport === "stdio"
          ? {
              command,
              args,
              ...(Object.keys(secrets).length > 0 ? { env: secrets } : {}),
            }
          : {
              url,
              ...(Object.keys(secrets).length > 0 ? { headers: secrets } : {}),
            }),
      };
      const validationError = createValidationError(input, transport);

      if (validationError !== "") {
        setError(validationError);
        return;
      }

      setSaving(true);
      setError("");

      try {
        await createMcpServer(input);
        props.onSaved();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to save the server.",
        );
        setSaving(false);
      }

      return;
    }

    const patch = secretPatch();
    const stdioSide = transport === "stdio" && stdioEditable;
    const input: UpdateMcpServerRequest = {
      name,
      enabled,
      ...(switched ? { transport } : {}),
      ...(stdioSide ? { command, args } : {}),
      ...(transport === "http" ? { url } : {}),
      ...(stdioSide && Object.keys(patch).length > 0 ? { env: patch } : {}),
      ...(transport === "http" && Object.keys(patch).length > 0
        ? { headers: patch }
        : {}),
    };
    const validationError = updateValidationError(
      input,
      transport,
      stdioSide ? command : (props.server?.command ?? ""),
      transport === "http" ? url : "",
    );

    if (validationError !== "") {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateMcpServer(props.server?.id ?? "", input);
      props.onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save the server.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog
      size="wide"
      title={creating ? "Add MCP server" : "Edit MCP server"}
      description={
        creating
          ? "Enabled servers become available to new chats."
          : "Changes apply to new chats. Running chats keep their saved configuration."
      }
      onClose={props.onClose}
    >
      <form
        className="max-h-[75vh] space-y-6 overflow-y-auto"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <label
            htmlFor="mcp-name"
            className="text-sm font-light text-zinc-400"
          >
            Name
          </label>

          <input
            autoFocus
            className={fieldClass}
            id="mcp-name"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this server"
            type="text"
            value={name}
          />
        </div>

        <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <p className="text-sm font-light text-zinc-400">Transport</p>

          <Selector
            disabled={!creating && !props.stdioAllowed}
            label="Server transport"
            onChange={handleTransportChange}
            options={transportChoices.map((entry) => ({
              value: entry.value,
              label: entry.title,
              description: entry.description,
              icon: transportIcon(entry.value),
            }))}
            value={transport}
          />
        </div>

        {!props.stdioAllowed && (
          <p className="text-sm font-light text-zinc-500">
            {creating
              ? "Standard I/O servers can only be added on the host computer."
              : "Executable, arguments, and environment can only be changed on the host computer."}
          </p>
        )}

        <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
          <p className="text-sm font-light text-zinc-400">Enabled</p>

          <div className="w-44">
            <SegmentedControl
              label="Server enabled"
              onChange={(value) => setEnabled(value === "enabled")}
              options={[
                { label: "Enabled", value: "enabled" },
                { label: "Disabled", value: "disabled" },
              ]}
              size="sm"
              value={enabled ? "enabled" : "disabled"}
            />
          </div>
        </div>

        {transport === "stdio" ? (
          <div className="space-y-6 border-t border-zinc-800 pt-5">
            <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
              <label
                htmlFor="mcp-command"
                className="text-sm font-light text-zinc-400"
              >
                Executable
              </label>

              <input
                className={fieldClass}
                disabled={!stdioEditable}
                id="mcp-command"
                maxLength={500}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="uvx"
                type="text"
                value={command}
              />
            </div>

            <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
              <p className="pt-2 text-sm font-light text-zinc-400">Arguments</p>

              <ArgumentList
                disabled={!stdioEditable}
                label="Argument"
                onChange={setArgs}
                values={args}
              />
            </div>

            <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
              <p className="pt-2 text-sm font-light text-zinc-400">
                Environment
              </p>

              <SecretList
                disabled={!stdioEditable}
                kind="env"
                onChange={setSecrets}
                rows={secrets}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6 border-t border-zinc-800 pt-5">
            <div className="grid items-center gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
              <label
                htmlFor="mcp-url"
                className="text-sm font-light text-zinc-400"
              >
                Endpoint
              </label>

              <input
                className={fieldClass}
                id="mcp-url"
                maxLength={2000}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://mcp.example.com/rpc"
                type="url"
                value={url}
              />
            </div>

            <div className="grid items-start gap-2 sm:grid-cols-[120px_1fr] sm:gap-6">
              <p className="pt-2 text-sm font-light text-zinc-400">Headers</p>

              <SecretList
                disabled={false}
                kind="headers"
                onChange={setSecrets}
                rows={secrets}
              />
            </div>
          </div>
        )}

        {error !== "" && (
          <p className="text-sm font-light text-rose-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
          <button
            className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-400 hover:bg-zinc-800"
            onClick={props.onClose}
            type="button"
          >
            Cancel
          </button>

          <button
            className="rounded-lg bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            disabled={saving}
          >
            {saving ? "Saving…" : creating ? "Add server" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default McpServerDialog;
