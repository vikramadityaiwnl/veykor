import { Navigate, Outlet } from "react-router-dom";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/VStack";
import { useAuthStore } from "./auth-store";

export function SessionLoading() {
  const error = useAuthStore((state) => state.error);
  const refresh = useAuthStore((state) => state.refresh);

  return (
    <VStack
      minHeight="100svh"
      justify="center"
      hAlign="center"
      gap={4}
      padding={6}
    >
      {error ? (
        <>
          <Banner
            status="error"
            title="Connection interrupted"
            description={error}
          />
          <Button label="Try again" clickAction={refresh} />
        </>
      ) : (
        <Spinner label="Checking your session…" />
      )}
    </VStack>
  );
}

export function ProtectedLayout() {
  const status = useAuthStore((state) => state.status);

  if (!status) {
    return <SessionLoading />;
  }

  return status.user ? <Outlet /> : <Navigate to="/" replace />;
}
