import { useState } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import type { InterruptionBehavior } from "@veykor/shared";
import { clearAttachmentDatabase } from "../chat/attachment-store.ts";
import Divider from "../components/divider/divider.tsx";
import SegmentedControl from "../components/segmented-control/segmented-control.tsx";
import type { SegmentedControlOption } from "../components/segmented-control/segmented-control.tsx";
import { removeAllData } from "../profile/profile-client.ts";
import RemoveDataDialog from "./components/remove-data-dialog.tsx";
import SettingItem from "./components/setting-item.tsx";
import { useThemeStore } from "../theme/theme-store.ts";
import type { Theme } from "../theme/theme-store.ts";
import { usePreferencesStore } from "../workspace/preferences-store.ts";

const themeOptions: Array<SegmentedControlOption<Theme>> = [
  {
    icon: <SunIcon aria-hidden="true" className="size-4" />,
    label: "Light",
    value: "light",
  },
  {
    icon: <MoonIcon aria-hidden="true" className="size-4" />,
    label: "Dark",
    value: "dark",
  },
];

const interruptionOptions: Array<SegmentedControlOption<InterruptionBehavior>> =
  [
    {
      label: "Queue",
      value: "queue",
    },
    {
      label: "Steer",
      value: "steer",
    },
  ];

function SettingsPage() {
  const [removeDataOpen, setRemoveDataOpen] = useState(false);
  const [removeDataError, setRemoveDataError] = useState("");
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const interruptionBehavior = usePreferencesStore(
    (state) => state.interruptionBehavior,
  );
  const setInterruptionBehavior = usePreferencesStore(
    (state) => state.setInterruptionBehavior,
  );
  const hideThinkingByDefault = usePreferencesStore(
    (state) => state.hideThinkingByDefault,
  );
  const setHideThinkingByDefault = usePreferencesStore(
    (state) => state.setHideThinkingByDefault,
  );

  async function handleRemoveAllData() {
    setRemoveDataError("");

    try {
      await removeAllData();
      await clearAttachmentDatabase().catch(() => {});

      try {
        window.localStorage.clear();
      } catch {
        window.location.replace("/");
        return;
      }

      window.location.replace("/");
    } catch (cause) {
      setRemoveDataError(
        cause instanceof Error
          ? cause.message
          : "Unable to remove veykor data.",
      );
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full space-y-6 px-6 py-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">Settings</h1>

          <p className="text-sm font-light text-zinc-400">
            Choose how veykor looks and behaves.
          </p>
        </div>

        <Divider />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Appearance</h2>

          <SettingItem description="Choose how veykor looks." title="Theme">
            <div className="w-44">
              <SegmentedControl
                label="Theme"
                onChange={setTheme}
                options={themeOptions}
                size="sm"
                value={theme}
              />
            </div>
          </SettingItem>
        </section>

        <Divider />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Chat</h2>

          <SettingItem
            description="What happens when you send a message while the agent is already working."
            title="Default interruption behavior"
          >
            <div className="w-44">
              <SegmentedControl
                label="Default interruption behavior"
                onChange={setInterruptionBehavior}
                options={interruptionOptions}
                size="sm"
                value={interruptionBehavior}
              />
            </div>
          </SettingItem>

          <SettingItem
            description="Hide tool activity and intermediate messages while a response is generating. Completed Thinking stays collapsed and can be expanded."
            title="Hide thinking by default"
          >
            <button
              aria-label="Hide thinking by default"
              aria-checked={hideThinkingByDefault}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${hideThinkingByDefault ? "bg-zinc-100" : "bg-zinc-700"}`}
              onClick={() => setHideThinkingByDefault(!hideThinkingByDefault)}
              role="switch"
              type="button"
            >
              <span
                className={`inline-block size-4 rounded-full transition ${hideThinkingByDefault ? "translate-x-6 bg-zinc-900" : "translate-x-1 bg-zinc-300"}`}
              />
            </button>
          </SettingItem>
        </section>

        <Divider />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Data</h2>

          <SettingItem
            description="Remove your veykor chats, projects, and saved configuration. Files in project folders are kept."
            title="Remove all data"
          >
            <button
              className="cursor-pointer rounded-lg border border-rose-900 px-3 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-950"
              onClick={() => {
                setRemoveDataError("");
                setRemoveDataOpen(true);
              }}
              type="button"
            >
              Remove all data
            </button>
          </SettingItem>
        </section>
      </div>

      {removeDataOpen && (
        <RemoveDataDialog
          error={removeDataError}
          onCancel={() => setRemoveDataOpen(false)}
          onConfirm={handleRemoveAllData}
        />
      )}
    </div>
  );
}

export default SettingsPage;
