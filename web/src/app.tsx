import { SparklesIcon } from "@heroicons/react/24/solid";

function App() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950">
      <button
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white shadow-lg transition duration-200 hover:-translate-y-0.5 hover:bg-indigo-400 hover:shadow-indigo-500/25 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-300"
        type="button"
      >
        <SparklesIcon aria-hidden="true" className="size-5" />
        veykor
      </button>
    </main>
  );
}

export default App;
