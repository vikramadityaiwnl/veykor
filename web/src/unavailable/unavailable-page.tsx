import Logo from "../components/logo/logo.tsx";

interface Props {
  error: string;
  onRetry: () => void;
}

function UnavailablePage(props: Props) {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-6 py-10">
      <div className="flex w-full max-w-xs flex-col items-center space-y-6 text-center">
        <Logo size={56} />

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">unavailable</h1>

          <p className="text-sm font-light text-zinc-400">
            Check that the veykor server is running, then try again.
          </p>
        </div>

        <button
          className="rounded-lg bg-zinc-100 px-8 py-2 font-semibold text-zinc-950 transition duration-200 hover:bg-white light:hover:bg-zinc-200"
          onClick={props.onRetry}
          type="button"
        >
          Retry
        </button>
      </div>
    </main>
  );
}

export default UnavailablePage;
