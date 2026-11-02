import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone } from "@fortawesome/free-solid-svg-icons";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { ChatProviderIcon } from "../../workspace/components/chat-provider-icon";
import { resolveTranscriptionSelection } from "../../workspace/transcribe-recorder";
import { useSettingsStore } from "../settings-store";
import { useTranscriptionDefaultsStore } from "../transcription-defaults-store";
import { SettingsGroup } from "./settings-group";

export function SettingsTranscriptionPanel() {
  const catalog = useTranscriptionDefaultsStore((state) => state.providers);
  const savedProviderId = useTranscriptionDefaultsStore(
    (state) => state.providerId,
  );
  const savedModelId = useTranscriptionDefaultsStore((state) => state.modelId);
  const keyConfigured = useTranscriptionDefaultsStore(
    (state) => state.keyConfigured,
  );
  const keyPreview = useTranscriptionDefaultsStore((state) => state.keyPreview);
  const status = useTranscriptionDefaultsStore((state) => state.status);
  const load = useTranscriptionDefaultsStore((state) => state.load);
  const save = useTranscriptionDefaultsStore((state) => state.save);
  const saveKey = useTranscriptionDefaultsStore((state) => state.saveKey);
  const clearKey = useTranscriptionDefaultsStore((state) => state.clearKey);
  const providers = useSettingsStore((state) => state.providers);
  const settingsStatus = useSettingsStore((state) => state.status);
  const loadSettings = useSettingsStore((state) => state.load);

  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const available = providers.filter((entry) => entry.available);

  const selection = resolveTranscriptionSelection(
    catalog,
    providers,
    savedProviderId,
    savedModelId,
  );

  const providerId = selection.providerId;
  const modelId = selection.modelId;

  const transcription = catalog.find((entry) => entry.id === providerId);
  const models = transcription?.models || [];

  useEffect(() => {
    void load();
    void loadSettings();
  }, [load, loadSettings]);

  function selectProvider(id: string) {
    const next = catalog.find((entry) => entry.id === id)?.models || [];
    const model = next.some((entry) => entry.id === savedModelId)
      ? savedModelId
      : next[0]?.id || "";

    void save(id, model);
  }

  function selectModel(id: string) {
    void save(providerId, id);
  }

  async function storeKey() {
    const key = keyInput.trim();

    if (busy || !key) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await saveKey(key);
      setKeyInput("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save the API key. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await clearKey();
      setKeyInput("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to remove the API key. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (
    status === "idle" ||
    status === "loading" ||
    settingsStatus === "idle" ||
    settingsStatus === "loading"
  ) {
    return <Spinner label="Loading transcription settings…" />;
  }

  if (status === "error" || settingsStatus === "error") {
    return (
      <VStack gap={2}>
        <Banner
          status="error"
          title="Couldn't load transcription settings"
          description="Please try again."
        />

        <Button
          label="Try again"
          clickAction={() => {
            void load();
            void loadSettings();
          }}
        />
      </VStack>
    );
  }

  return (
    <VStack
      id="settings-panel-transcription"
      gap={4}
      isScrollable
      className="min-h-0 flex-1 overscroll-contain"
    >
      <SettingsGroup>
        <HStack
          gap={4}
          vAlign="center"
          justify="between"
          wrap="wrap"
          padding={4}
        >
          <VStack gap={1}>
            <Text weight="semibold">Provider</Text>

            <Text color="secondary" type="supporting">
              Which provider transcribes voice input.
            </Text>
          </VStack>

          <Selector
            startIcon={<ChatProviderIcon providerId={providerId} />}
            label="Transcription provider"
            isLabelHidden
            variant="input"
            width="16rem"
            value={providerId}
            emptyText="No providers available"
            options={available.map((entry) => ({
              value: entry.id,
              label: entry.label,
              icon: <ChatProviderIcon providerId={entry.id} />,
            }))}
            onChange={selectProvider}
          />
        </HStack>

        <HStack
          gap={4}
          vAlign="center"
          justify="between"
          wrap="wrap"
          padding={4}
        >
          <VStack gap={1}>
            <Text weight="semibold">Model</Text>

            <Text color="secondary" type="supporting">
              Which transcription model turns speech into text.
            </Text>
          </VStack>

          <Selector
            startIcon={<FontAwesomeIcon icon={faMicrophone} />}
            label="Transcription model"
            isLabelHidden
            variant="input"
            width="16rem"
            value={modelId}
            isDisabled={!providerId}
            emptyText={
              providerId
                ? "No transcription models for this provider"
                : "Choose a provider first"
            }
            options={models.map((entry) => ({
              value: entry.id,
              label: entry.name,
              description: entry.description || undefined,
              icon: <FontAwesomeIcon icon={faMicrophone} />,
            }))}
            onChange={selectModel}
          />
        </HStack>

        <HStack
          gap={4}
          vAlign="center"
          justify="between"
          wrap="wrap"
          padding={4}
        >
          <VStack gap={1}>
            <Text weight="semibold">API key</Text>

            <Text color="secondary" type="supporting">
              Model API key used for live transcription. Saving a new key
              replaces the current one.
            </Text>
          </VStack>

          <HStack gap={2} vAlign="center" wrap="wrap">
            <TextInput
              type="password"
              label="Model API key"
              isLabelHidden
              value={keyInput}
              onChange={setKeyInput}
              onEnter={() => {
                void storeKey();
              }}
              placeholder={keyConfigured ? keyPreview : "Enter Model API key"}
              width="16rem"
              isDisabled={busy}
              autoComplete="off"
            />

            <Button
              label={busy ? "Saving…" : "Save"}
              isDisabled={busy || !keyInput.trim()}
              clickAction={() => {
                void storeKey();
              }}
            />

            {keyConfigured && (
              <Button
                label="Remove"
                variant="ghost"
                isDisabled={busy}
                clickAction={() => {
                  void removeKey();
                }}
              />
            )}
          </HStack>
        </HStack>
      </SettingsGroup>

      {error && (
        <Banner
          status="error"
          title="Couldn't update API key"
          description={error}
        />
      )}
    </VStack>
  );
}
