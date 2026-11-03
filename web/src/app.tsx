import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./auth/auth-page";
import { ProtectedLayout } from "./auth/auth-routes";
import { useAuthSession } from "./auth/use-auth-session";
import { WorkspaceLayout } from "./workspace/workspace-layout";
import { ProjectHomePage } from "./workspace/project-home-page";
import { AgentsPage } from "./agents/agents-page";
import { IntegrationsPage } from "./integrations/integrations-page";
import { SettingsPage } from "./settings/settings-page";
import { ConfigurationPage } from "./configuration/configuration-page";

function App() {
  useAuthSession();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/configuration" element={<ConfigurationPage />} />

          <Route path="/" element={<WorkspaceLayout />}>
            <Route index element={<ProjectHomePage />} />
            <Route path="chat/:sessionId" element={<ProjectHomePage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route
              path="agent-presets"
              element={<Navigate to="/agents" replace />}
            />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route
              path="profile"
              element={<Navigate to="/settings?tab=profile" replace />}
            />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
