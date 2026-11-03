import { useEffect, useState } from "react";
import { SparklesIcon } from "@heroicons/react/24/solid";
import type { HealthResponse } from "@veykor/shared/health";

function App() {
  const [health, setHealth] = useState<HealthResponse | "unavailable" | null>(
    null,
  );

  useEffect(() => {
    async function loadHealth() {
      try {
        const response = await fetch("/api/health");

        if (!response.ok) {
          throw new Error("The API health request failed");
        }

        setHealth((await response.json()) as HealthResponse);
      } catch {
        setHealth("unavailable");
      }
    }

    void loadHealth();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 text-center">
      <section className="space-y-4">
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white shadow-lg transition duration-200 hover:-translate-y-0.5 hover:bg-indigo-400 hover:shadow-indigo-500/25 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-300"
          type="button"
        >
          <SparklesIcon aria-hidden="true" className="size-5" />
          veykor
        </button>

        <p className="text-sm text-zinc-400" role="status">
          {health === null
            ? "Connecting to the API..."
            : health === "unavailable"
              ? "API unavailable"
              : `API and SQLite connected · ${health.service}`}
        </p>
      </section>
    </main>
  );
}

export default App;
