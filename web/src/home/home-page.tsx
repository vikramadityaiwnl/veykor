import { useState } from "react";
import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/solid";
import type { AuthUser } from "@veykor/shared";
import { logout } from "../auth/auth-client.ts";

interface Props {
  user: AuthUser;
  onSignedOut: () => void;
}

function HomePage(props: Props) {
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
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-10">
      <section className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">veykor</h1>

          <p className="text-sm font-light text-zinc-400">
            Signed in as{" "}
            <span className="font-semibold text-zinc-100">
              {props.user.username}
            </span>
          </p>
        </div>

        {error !== "" && (
          <p className="text-sm font-light text-rose-400" role="alert">
            {error}
          </p>
        )}

        <button
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 font-semibold text-zinc-950 transition duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          onClick={handleSignOut}
          type="button"
        >
          <ArrowRightStartOnRectangleIcon
            aria-hidden="true"
            className="size-5"
          />

          {pending ? "Signing out..." : "Sign out"}
        </button>
      </section>
    </main>
  );
}

export default HomePage;
