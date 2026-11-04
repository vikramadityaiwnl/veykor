import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import type { InterruptionBehavior } from "@veykor/shared";
import Divider from "../components/divider/divider.tsx";
import SegmentedControl from "../components/segmented-control/segmented-control.tsx";
import type { SegmentedControlOption } from "../components/segmented-control/segmented-control.tsx";
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
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const interruptionBehavior = usePreferencesStore(
    (state) => state.interruptionBehavior,
  );
  const setInterruptionBehavior = usePreferencesStore(
    (state) => state.setInterruptionBehavior,
  );

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
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
