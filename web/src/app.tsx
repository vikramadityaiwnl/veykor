import { useCallback, useEffect, useState } from "react";
import type { AuthStatus } from "@veykor/shared";
import { fetchStatus } from "./auth/auth-client.ts";
import AuthPage from "./auth/auth-page.tsx";
import HomePage from "./home/home-page.tsx";

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
    if (!status) {
      return;
    }

    const desired = status.authenticated ? "/" : "/auth";

    if (pathname !== desired) {
      window.history.pushState(null, "", desired);
      setPathname(desired);
    }
  }, [status, pathname]);

  if (loadError !== "" && !status) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4">
        <section className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <h1 className="text-xl font-semibold text-zinc-50">veykor</h1>

          <p className="text-sm font-light text-rose-400" role="alert">
            {loadError}
          </p>

          <button
            className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 font-semibold text-zinc-950 transition duration-200 hover:bg-white"
            onClick={() => void refresh()}
            type="button"
          >
            Retry
          </button>
        </section>
      </main>
    );
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
