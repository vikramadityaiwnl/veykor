import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTerminal } from "@fortawesome/free-solid-svg-icons";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { SettingsGroup } from "./settings-group";
import { Heading } from "@astryxdesign/core/Heading";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useSettingsStore } from "../settings-store";

const logos: Record<string, { src: string; invertInDark: boolean } | null> = {
  muse: { src: "/providers/muse.svg", invertInDark: true },
  codex: { src: "/providers/codex.svg", invertInDark: true },
  claude: { src: "/providers/claude.svg", invertInDark: true },
  opencode: { src: "/providers/opencode.svg", invertInDark: true },
  deepseek: { src: "/providers/deepseek.svg", invertInDark: true },
  aider: null,
};

export function ProviderCliList() {
  const providers = useSettingsStore((state) => state.providers);
  const status = useSettingsStore((state) => state.status);
  const error = useSettingsStore((state) => state.error);
  const loadCli = useSettingsStore((state) => state.load);

  if (status === "error") {
    return (
      <VStack gap={2}>
        <Banner status="error" title="Detection failed" description={error} />

        <Button
          label="Try again"
          clickAction={() => {
            void loadCli();
          }}
        />
      </VStack>
    );
  }

  if (status === "loading" || status === "idle") {
    return <Spinner label="Detecting installed tools…" />;
  }

  return (
    <SettingsGroup>
      <Grid columns={2} gap={0} className="veykor-provider-grid">
        {providers.map((provider) => {
          const logo = logos[provider.id] ?? null;

          return (
            <HStack
              key={provider.id}
              gap={4}
              padding={4}
              vAlign="center"
              className={`veykor-provider-tile min-w-0 ${provider.id !== "muse" ? "opacity-40 grayscale" : ""}`}
              aria-disabled={provider.id !== "muse"}
            >
              <HStack
                vAlign="center"
                className="h-(--spacing-8) w-12 shrink-0 justify-center"
              >
                {logo ? (
                  <img
                    className={
                      logo.invertInDark
                        ? "h-(--spacing-8) w-auto object-contain dark:invert"
                        : "h-(--spacing-8) w-auto object-contain"
                    }
                    src={logo.src}
                    alt=""
                  />
                ) : (
                  <FontAwesomeIcon
                    icon={faTerminal}
                    size="xl"
                    className="size-(--spacing-8)! text-(--color-icon-primary)"
                    aria-hidden="true"
                  />
                )}
              </HStack>

              <VStack gap={2} className="min-w-0 flex-1">
                <HStack gap={2} vAlign="center">
                  <Heading level={3} weight="semibold">
                    {provider.label}
                  </Heading>

                  {provider.version ? (
                    <Text type="supporting" color="secondary">
                      {provider.version}
                    </Text>
                  ) : null}
                </HStack>

                <HStack gap={2} vAlign="center">
                  <StatusDot
                    variant={provider.installed ? "success" : "neutral"}
                    label={
                      provider.id !== "muse"
                        ? "Coming soon"
                        : provider.available
                          ? "Available"
                          : "Unavailable"
                    }
                  />

                  <Text type="supporting" color="secondary">
                    {provider.id !== "muse"
                      ? "Coming soon"
                      : provider.available
                        ? "Available"
                        : "Unavailable"}
                  </Text>
                </HStack>
              </VStack>
            </HStack>
          );
        })}
      </Grid>
    </SettingsGroup>
  );
}
