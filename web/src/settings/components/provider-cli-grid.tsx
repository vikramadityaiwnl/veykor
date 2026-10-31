import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTerminal } from "@fortawesome/free-solid-svg-icons";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useSettingsStore } from "../settings-store";

const logos: Record<string, { src: string; invertInDark: boolean } | null> = {
  muse: { src: "/providers/muse.svg", invertInDark: false },
  codex: { src: "/providers/codex.svg", invertInDark: true },
  claude: { src: "/providers/claude.svg", invertInDark: true },
  opencode: { src: "/providers/opencode.svg", invertInDark: true },
  aider: null,
};

export function ProviderCliGrid() {
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
    <Grid columns={{ minWidth: 240 }} gap={4}>
      {providers.map((provider) => {
        const logo = logos[provider.id] ?? null;

        return (
          <Card
            key={provider.id}
            elevation="none"
            className={provider.installed ? undefined : "opacity-50"}
          >
            <VStack gap={2}>
              {logo ? (
                <img
                  className={
                    logo.invertInDark
                      ? "size-(--spacing-12) object-contain dark:invert"
                      : "size-(--spacing-12) object-contain"
                  }
                  src={logo.src}
                  alt=""
                />
              ) : (
                <FontAwesomeIcon
                  icon={faTerminal}
                  size="xl"
                  className="text-(--color-icon-secondary)"
                  aria-hidden="true"
                />
              )}

              <HStack gap={2} vAlign="end">
                <Heading level={3} weight="semibold">
                  {provider.label}
                </Heading>

                <Text type="supporting" color="secondary">
                  {provider.company}
                </Text>
              </HStack>

              <HStack gap={2} vAlign="center">
                <Text type="code" color="secondary">
                  {provider.cli}
                </Text>

                <Text
                  type="supporting"
                  color="secondary"
                  maxLines={1}
                  className="min-w-0 flex-1"
                >
                  {provider.version || "unknown"}
                </Text>
              </HStack>

              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant={provider.installed ? "success" : "neutral"}
                  label={provider.installed ? "Installed" : "Not installed"}
                />

                <Text type="supporting" color="secondary">
                  {provider.installed ? "Installed" : "Not installed"}
                </Text>
              </HStack>
            </VStack>
          </Card>
        );
      })}
    </Grid>
  );
}
