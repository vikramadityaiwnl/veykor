import { useState } from "react";
import { Outlet } from "react-router";
import type { AuthUser } from "@veykor/shared";
import { logout } from "../auth/auth-client.ts";
import Sidebar from "../components/sidebar/sidebar.tsx";

interface Props {
  onSignedOut: () => void;
  user: AuthUser;
}

function WorkspaceLayout(props: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    setPending(true);
    setError("");

    try {
      await logout();

      props.onSignedOut();
    } catch (cause) {
      if (cause instanceof Error) {
        setError(cause.message);
      } else {
        setError("Sign-out failed.");
      }

      setPending(false);
    }
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        onSignOut={handleSignOut}
        signingOut={pending}
        user={props.user}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <Outlet />

        {error !== "" && (
          <p
            className="absolute inset-x-0 top-4 mx-auto w-fit rounded-full border border-rose-900 bg-zinc-900 px-4 py-2 text-center text-sm font-light text-rose-400"
            role="alert"
          >
            {error}
          </p>
        )}
      </main>
    </div>
  );
}

export default WorkspaceLayout;
