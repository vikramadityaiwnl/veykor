import { useEffect, useState } from "react";
import type { ChatMessageBehavior } from "@veykor/shared";
import { Banner } from "@astryxdesign/core/Banner";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useChatDefaultsStore } from "../../workspace/chat-defaults-store";
import { SettingsGroup } from "./settings-group";

export function MessageBehaviorPreference() {
  const behavior = useChatDefaultsStore((state) => state.messageBehavior);
  const status = useChatDefaultsStore((state) => state.status);
  const load = useChatDefaultsStore((state) => state.load);
  const save = useChatDefaultsStore((state) => state.saveBehavior);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  async function change(value: string) {
    setBusy(true);
    setError("");

    try {
      await save(value as ChatMessageBehavior);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save preference",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsGroup>
      <HStack gap={4} vAlign="center" justify="between" wrap="wrap" padding={4}>
        <VStack gap={1}>
          <Text weight="semibold">Messages while working</Text>
          <Text color="secondary" type="supporting">
            Choose what happens when you send a message during a reply.
          </Text>
        </VStack>
        <Selector
          label="Messages while working"
          isLabelHidden
          size="sm"
          value={behavior}
          isDisabled={busy || status !== "ready"}
          options={[
            {
              value: "queue",
              label: "Add to queue",
              description: "Send after the current reply finishes.",
            },
            {
              value: "steer",
              label: "Steer immediately",
              description: "Send instructions into the current turn.",
            },
          ]}
          onChange={(value) => void change(value)}
        />
      </HStack>
      {error && <Banner status="error" title={error} />}
    </SettingsGroup>
  );
}
