import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./auth/auth-page";
import { ProtectedLayout } from "./auth/auth-routes";
import { useAuthSession } from "./auth/use-auth-session";
import { OrganizationsPage } from "./organizations";
import { ConfigurationPage } from "./configuration/configuration-page";

function App() {
  useAuthSession();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/configuration" element={<ConfigurationPage />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/organizations" element={<OrganizationsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
