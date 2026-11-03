import { useState } from "react";
import type { AuthUser } from "@veykor/shared";
import { logout } from "../auth/auth-client.ts";
import AgentsPage from "../agents/agents-page.tsx";
import Sidebar from "../components/sidebar/sidebar.tsx";
import ProfilePage from "../profile/profile-page.tsx";
import SettingsPage from "../settings/settings-page.tsx";
import ChatScreen from "../chat/chat-screen.tsx";

interface Props {
  onSignedOut: () => void;
  pathname: string;
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
        {props.pathname === "/agents" && <AgentsPage />}

        {props.pathname === "/profile" && <ProfilePage />}

        {props.pathname === "/settings" && <SettingsPage />}

        {props.pathname === "/" && <ChatScreen />}

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
