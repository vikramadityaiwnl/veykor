import { useEffect, useState } from "react";
import type { ConfigurationUsersResponse } from "@veykor/shared";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { Layout, LayoutHeader, LayoutContent, VStack } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Spinner } from "@astryxdesign/core/Spinner";

export function ConfigurationPage() {
  const [result, setResult] = useState<ConfigurationUsersResponse | null>(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setResult(null);
      setError("");
      setDenied(false);

      try {
        const response = await fetch("/api/configuration/users", {
          signal: controller.signal,
          cache: "no-store",
        });

        if (controller.signal.aborted) {
          return;
        }

        if (response.status === 403) {
          setDenied(true);
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load users");
        }

        const data: ConfigurationUsersResponse = await response.json();

        if (!controller.signal.aborted) {
          setResult(data);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Unable to load users. Please try again.");
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [attempt]);

  return (
    <Layout
      height="fill"
      contentWidth={1440}
      header={
        <LayoutHeader hasDivider>
          <Heading level={1} weight="semibold">
            veykor configuration
          </Heading>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={4}>
            {denied ? (
              <Banner
                status="error"
                title="Host access required"
                description="Open this page through localhost on the computer running the server."
              />
            ) : error ? (
              <>
                <Banner
                  status="error"
                  title="Couldn't load configuration"
                  description={error}
                />
                <Button
                  label="Try again"
                  clickAction={() => setAttempt((value) => value + 1)}
                />
              </>
            ) : !result ? (
              <Spinner label="Loading configuration…" />
            ) : (
              <Grid columns={{ minWidth: 320 }} gap={10}>
                <VStack gap={1}>
                  <Heading level={2} weight="semibold">
                    Users
                  </Heading>
                  <Text color="secondary">
                    Registered accounts on this veykor server.
                  </Text>
                  <Text color="secondary">
                    Organization preferences and settings will be available here
                    in the future.
                  </Text>
                </VStack>

                <VStack gap={4}>
                  <Text>{result.users.length} registered users</Text>
                  {result.users.length === 0 ? (
                    <Text color="secondary">No users have registered yet.</Text>
                  ) : (
                    <List density="balanced" aria-label="Registered users">
                      {result.users.map((user) => (
                        <ListItem
                          key={user.id}
                          label={user.username}
                          description={`User ID: ${user.id}`}
                          startContent={
                            <Avatar
                              name={user.username}
                              src={user.photo ?? undefined}
                            />
                          }
                        />
                      ))}
                    </List>
                  )}
                  <Button
                    label="Refresh users"
                    clickAction={() => setAttempt((value) => value + 1)}
                  />
                </VStack>
              </Grid>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
