import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { ConfigurationUsersResponse } from "@veykor/shared";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Divider } from "@astryxdesign/core/Divider";
import { Layout, LayoutHeader, LayoutContent, VStack } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Spinner } from "@astryxdesign/core/Spinner";
import { SessionLoading } from "../auth/auth-routes";
import { useAuthStore } from "../auth/auth-store";

export function ConfigurationPage() {
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const isHost = status?.registrationAllowed ?? null;

  const [result, setResult] = useState<ConfigurationUsersResponse | null>(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isHost !== true) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      setResult(null);
      setError("");
      setDenied(false);
      setUnauthorized(false);

      try {
        const response = await fetch("/api/configuration/users", {
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
        });

        if (controller.signal.aborted) {
          return;
        }

        if (response.status === 403) {
          setDenied(true);
          return;
        }

        if (response.status === 401) {
          setUnauthorized(true);
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
  }, [attempt, isHost]);

  if (!status) {
    return <SessionLoading />;
  }

  if (!status.user || unauthorized) {
    return <Navigate to="/auth" replace />;
  }

  const currentUserId = status.user.id;

  return (
    <Layout
      height="fill"
      className="h-dvh overflow-hidden"
      contentWidth="100%"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={4} vAlign="center" className="w-full">
            <img
              src="/logo.svg"
              alt=""
              className="size-(--spacing-8) object-contain dark:invert"
            />
            <Text weight="semibold" className="flex-1">
              veykor
            </Text>
            <Button
              label="Back to workspace"
              variant="secondary"
              clickAction={() => navigate("/")}
            />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={6}>
          <VStack gap={8} className="mx-auto w-full max-w-4xl py-6">
            <VStack gap={2}>
              <Text type="supporting" color="secondary">
                SERVER ADMINISTRATION
              </Text>
              <Heading level={1} weight="semibold">
                Configuration
              </Heading>
              <Text color="secondary">
                Manage the accounts registered on your veykor server.
              </Text>
            </VStack>
            <Divider />
            {denied || isHost === false ? (
              <VStack gap={4}>
                <Banner
                  status="error"
                  title="Host access required"
                  description="Configuration is available only on the host computer through localhost."
                  role="alert"
                />
              </VStack>
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
              <VStack gap={6}>
                <VStack gap={1}>
                  <Heading level={2} weight="semibold">
                    Users
                  </Heading>
                  <Text color="secondary">
                    Registered accounts on this veykor server.
                  </Text>
                </VStack>

                <VStack gap={4}>
                  <HStack gap={4} vAlign="center" justify="between">
                    <Text color="secondary">
                      {result.users.length} registered{" "}
                      {result.users.length === 1 ? "account" : "accounts"}
                    </Text>
                    <Button
                      label="Refresh users"
                      variant="secondary"
                      size="sm"
                      clickAction={() => setAttempt((value) => value + 1)}
                    />
                  </HStack>
                  {result.users.length === 0 ? (
                    <Text color="secondary">No users have registered yet.</Text>
                  ) : (
                    <List density="balanced" aria-label="Registered users">
                      {result.users.map((user) => (
                        <ListItem
                          key={user.id}
                          label={user.username}
                          description={
                            user.id === currentUserId
                              ? "Your account"
                              : "Member"
                          }
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
                </VStack>
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
