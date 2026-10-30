import { useState } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useAuthStore } from "./auth/auth-store";

export function OrganizationsPage() {
  const user = useAuthStore((state) => state.status?.user);
  const logout = useAuthStore((state) => state.logout);
  const [error, setError] = useState("");

  async function signOut() {
    setError("");

    try {
      await logout();
    } catch {
      setError("Sign out failed. Please retry.");
    }
  }

  if (!user) {
    return null;
  }

  return (
    <VStack
      minHeight="100svh"
      justify="center"
      hAlign="center"
      gap={4}
      padding={6}
    >
      <Heading level={1} weight="semibold">
        Organizations
      </Heading>
      <Avatar name={user.username} src={user.photo ?? undefined} size="xl" />
      <Heading level={2} weight="semibold">
        {user.username}
      </Heading>
      <Text>veykor account</Text>
      <Text color="secondary">Your organizations will appear here.</Text>

      {error && (
        <Banner
          status="error"
          title="Couldn't sign out"
          description={error}
          role="alert"
        />
      )}

      <Button label="Sign out" clickAction={signOut} />
    </VStack>
  );
}
