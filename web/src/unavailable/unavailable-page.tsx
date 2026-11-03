import { SignalSlashIcon } from "@heroicons/react/24/solid";
import { authPaths } from "@veykor/shared";

interface Props {
  error: string;
  onRetry: () => void;
}

function UnavailablePage(props: Props) {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-10">
      <section className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="space-y-3">
          <SignalSlashIcon
            aria-hidden="true"
            className="mx-auto size-8 text-zinc-500"
          />

          <h1 className="text-2xl font-semibold text-zinc-50">
            veykor is unavailable
          </h1>

          <p className="text-sm font-light text-zinc-400">
            We could not reach the veykor server, so there is nothing to sign in
            to right now.
          </p>
        </div>

        <div className="space-y-2 rounded-lg bg-zinc-800 p-4 text-left">
          <p className="text-sm font-light text-zinc-300" role="alert">
            {props.error}
          </p>

          <p className="text-xs font-light text-zinc-500">
            Tried {authPaths.status} on this host. Start the API on the host
            machine, then retry.
          </p>
        </div>

        <button
          className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 font-semibold text-zinc-950 transition duration-200 hover:bg-white"
          onClick={props.onRetry}
          type="button"
        >
          Retry
        </button>
      </section>
    </main>
  );
}

export default UnavailablePage;
