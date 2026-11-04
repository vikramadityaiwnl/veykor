import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import type { AuthStatus } from "@veykor/shared";
import { fetchStatus } from "./auth/auth-client.ts";
import AuthPage from "./auth/auth-page.tsx";
import ChatRoute from "./chat/chat-route.tsx";
import WorkPage from "./work/work-page.tsx";
import AgentsPage from "./agents/agents-page.tsx";
import IntegrationsPage from "./integrations/integrations-page.tsx";
import MemoryPage from "./memory/memory-page.tsx";
import ProfilePage from "./profile/profile-page.tsx";
import SettingsPage from "./settings/settings-page.tsx";
import WorkspaceLayout from "./workspace/workspace-layout.tsx";
import UnavailablePage from "./unavailable/unavailable-page.tsx";

function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const nextStatus = await fetchStatus();

      setLoadError("");
      setStatus(nextStatus);
    } catch (cause) {
      if (cause instanceof Error) {
        setLoadError(cause.message);
      } else {
        setLoadError("Unable to reach the veykor server.");
      }
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    void fetchStatus().then(
      (nextStatus) => {
        if (!disposed) {
          setStatus(nextStatus);
        }
      },
      (cause: unknown) => {
        if (!disposed) {
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "Unable to reach the veykor server.",
          );
        }
      },
    );

    return () => {
      disposed = true;
    };
  }, []);

  if (loadError !== "" && !status) {
    return <UnavailablePage error={loadError} onRetry={() => void refresh()} />;
  }

  if (!status) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4">
        <p className="text-sm font-light text-zinc-400" role="status">
          Connecting to veykor...
        </p>
      </main>
    );
  }

  if (status.authenticated) {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            element={
              <WorkspaceLayout
                onSignedOut={() => void refresh()}
                user={status.user}
              />
            }
          >
            <Route index element={<ChatRoute />} />
            <Route path="chat/:chatId" element={<ChatRoute />} />
            <Route path="work" element={<WorkPage />} />
            <Route path="work/:projectId" element={<ChatRoute />} />
            <Route
              path="work/:projectId/chat/:chatId"
              element={<ChatRoute />}
            />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="memory" element={<MemoryPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    );
  }

  return <AuthPage onAuthenticated={() => void refresh()} status={status} />;
}

export default App;
