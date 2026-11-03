import { useCallback, useEffect, useState } from "react";
import type { AuthStatus } from "@veykor/shared";
import { fetchStatus } from "./auth/auth-client.ts";
import AuthPage from "./auth/auth-page.tsx";
import HomePage from "./home/home-page.tsx";
import UnavailablePage from "./unavailable/unavailable-page.tsx";

function currentPath(): string {
  return window.location.pathname;
}

function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pathname, setPathname] = useState(currentPath);

  const refresh = useCallback(async () => {
    setLoadError("");

    try {
      setStatus(await fetchStatus());
    } catch (cause) {
      if (cause instanceof Error) {
        setLoadError(cause.message);
      } else {
        setLoadError("Unable to reach the veykor server.");
      }
    }
  }, []);

  useEffect(() => {
    function handleLocationChange() {
      setPathname(currentPath());
    }

    window.addEventListener("popstate", handleLocationChange);

    void refresh();

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (!status && loadError === "") {
      return;
    }

    const desired = !status
      ? "/unavailable"
      : status.authenticated
        ? "/"
        : "/auth";

    if (pathname !== desired) {
      window.history.pushState(null, "", desired);
      setPathname(desired);
    }
  }, [status, loadError, pathname]);

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
    return <HomePage onSignedOut={() => void refresh()} user={status.user} />;
  }

  return <AuthPage onAuthenticated={() => void refresh()} status={status} />;
}

export default App;
