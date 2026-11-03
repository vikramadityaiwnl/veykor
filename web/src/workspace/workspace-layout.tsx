import { useState } from "react";
import type { FormEvent } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import type { AuthUser } from "@veykor/shared";
import { logout } from "../auth/auth-client.ts";
import Logo from "../components/logo/logo.tsx";
import Sidebar from "../components/sidebar/sidebar.tsx";

interface Props {
  onSignedOut: () => void;
  user: AuthUser;
}

function WorkspaceLayout(props: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        onSignOut={handleSignOut}
        signingOut={pending}
        user={props.user}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="grid flex-1 place-items-center px-6">
          <div className="space-y-4 text-center">
            <div className="flex justify-center opacity-40">
              <Logo size={48} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-zinc-100">
                Start a conversation
              </h2>

              <p className="text-sm font-light text-zinc-400">
                Start a chat or write your message below.
              </p>
            </div>
          </div>
        </div>

        {error !== "" && (
          <p
            className="px-6 pb-2 text-center text-sm font-light text-rose-400"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="border-t border-zinc-800 p-4">
          <form
            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2 pl-4"
            onSubmit={handleSubmit}
          >
            <input
              className="w-full bg-transparent text-sm font-light text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Message veykor..."
              type="text"
              value={draft}
            />

            <button
              aria-label="Send message"
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-950 transition hover:bg-white"
              type="submit"
            >
              <PaperAirplaneIcon aria-hidden="true" className="size-4" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default WorkspaceLayout;
