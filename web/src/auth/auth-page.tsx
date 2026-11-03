import { useState } from "react";
import type { AuthStatus, LoginRequest } from "@veykor/shared";
import { login, register } from "./auth-client.ts";
import AuthForm from "./components/auth-form.tsx";

interface Props {
  status: AuthStatus;
  onAuthenticated: () => void;
}

type Mode = "login" | "register";

function AuthPage(props: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const canRegister = props.status.registrationAllowed;
  const activeMode = canRegister ? mode : "login";

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  async function handleSubmit(input: LoginRequest) {
    setPending(true);
    setError("");

    try {
      if (activeMode === "register") {
        await register(input);
      } else {
        await login(input);
      }

      props.onAuthenticated();
    } catch (cause) {
      if (cause instanceof Error) {
        setError(cause.message);
      } else {
        setError("Authentication failed.");
      }

      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-10">
      <section className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-zinc-50">veykor</h1>

          <p className="text-sm font-light text-zinc-400">
            {activeMode === "register"
              ? "Create an account on the host machine"
              : "Sign in from your local network"}
          </p>
        </div>

        {canRegister && (
          <div
            className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-800 p-1"
            role="tablist"
          >
            <button
              className={
                activeMode === "login"
                  ? "rounded-md bg-zinc-700 px-4 py-1.5 text-sm font-semibold text-zinc-50"
                  : "rounded-md px-4 py-1.5 text-sm font-light text-zinc-400 hover:text-zinc-200"
              }
              onClick={() => switchMode("login")}
              role="tab"
              type="button"
            >
              Sign in
            </button>

            <button
              className={
                activeMode === "register"
                  ? "rounded-md bg-zinc-700 px-4 py-1.5 text-sm font-semibold text-zinc-50"
                  : "rounded-md px-4 py-1.5 text-sm font-light text-zinc-400 hover:text-zinc-200"
              }
              onClick={() => switchMode("register")}
              role="tab"
              type="button"
            >
              Create account
            </button>
          </div>
        )}

        <AuthForm
          error={error}
          onSubmit={handleSubmit}
          passwordHint={
            activeMode === "register" ? "Use at least 8 characters." : ""
          }
          pending={pending}
          pendingLabel={
            activeMode === "register" ? "Creating account..." : "Signing in..."
          }
          submitLabel={activeMode === "register" ? "Create account" : "Sign in"}
        />
      </section>
    </main>
  );
}

export default AuthPage;
