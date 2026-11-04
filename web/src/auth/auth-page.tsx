import { useState } from "react";
import type { AuthStatus, LoginRequest } from "@veykor/shared";
import { login, register } from "./auth-client.ts";
import AuthForm from "./components/auth-form.tsx";
import BrandPanel from "../components/brand-panel/brand-panel.tsx";
import Logo from "../components/logo/logo.tsx";

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
    <main className="grid min-h-screen bg-zinc-950 md:grid-cols-2">
      <BrandPanel
        description="veykor is your local workspace for conversations and agentic workflows, fast, private, and always on your network."
        title="Chat and work, side by side"
      />

      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-2.5 md:hidden">
            <Logo size={28} />

            <div className="space-y-1">
              <span className="text-lg font-semibold text-zinc-50">veykor</span>

              <p className="text-xs font-light text-zinc-400">
                Powered by <span className="text-info">Muse Code</span> from{" "}
                <span className="text-info">Meta</span>
              </p>
            </div>
          </div>

          {activeMode === "login" && (
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-zinc-50">
                Welcome back
              </h1>

              <p className="text-sm font-light text-zinc-400">
                Sign in from your local network
              </p>
            </div>
          )}

          {activeMode === "register" && (
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-zinc-50">
                Create your account
              </h1>

              <p className="text-sm font-light text-zinc-400">
                Set up an account on the host machine
              </p>
            </div>
          )}

          <AuthForm
            error={error}
            onSubmit={handleSubmit}
            passwordHint=""
            pending={pending}
            pendingLabel={
              activeMode === "register"
                ? "Creating account..."
                : "Signing in..."
            }
            submitLabel={
              activeMode === "register" ? "Create account" : "Sign in"
            }
          />

          {canRegister && activeMode === "login" && (
            <p className="text-center text-sm font-light text-zinc-400">
              New to veykor?{" "}
              <button
                className="cursor-pointer font-semibold text-zinc-100 hover:underline"
                onClick={() => switchMode("register")}
                type="button"
              >
                Create an account
              </button>
            </p>
          )}

          {canRegister && activeMode === "register" && (
            <p className="text-center text-sm font-light text-zinc-400">
              Already have an account?{" "}
              <button
                className="cursor-pointer font-semibold text-zinc-100 hover:underline"
                onClick={() => switchMode("login")}
                type="button"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

export default AuthPage;
