import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useThemeStore } from "../../theme-store";
import { MessageBehaviorPreference } from "./message-behavior-preference";
import { SettingsGroup } from "./settings-group";

export function SettingsGeneralPanel() {
  const mode = useThemeStore((state) => state.mode);
  const save = useThemeStore((state) => state.save);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function changeTheme(value: string) {
    if (busy || (value !== "light" && value !== "dark")) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await save(value);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save preference",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <VStack
      id="settings-panel-general"
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
            <Text weight="semibold">Theme</Text>
            <Text color="secondary" type="supporting">
              Choose the appearance of your workspace.
            </Text>
          </VStack>
          <SegmentedControl
            label="Theme"
            value={mode}
            onChange={(value) => void changeTheme(value)}
            isDisabled={busy}
          >
            <SegmentedControlItem value="light" label="Light" />
            <SegmentedControlItem value="dark" label="Dark" />
          </SegmentedControl>
        </HStack>
      </SettingsGroup>
      <MessageBehaviorPreference />
      {error && (
        <Banner
          status="error"
          title="Couldn't save preference"
          description={error}
        />
      )}
    </VStack>
  );
}
