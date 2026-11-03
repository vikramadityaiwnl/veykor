import { useState } from "react";
import type { FormEvent } from "react";
import type { LoginRequest } from "@veykor/shared";

interface AuthFormProps {
  pending: boolean;
  error: string;
  submitLabel: string;
  pendingLabel: string;
  passwordHint: string;
  onSubmit: (input: LoginRequest) => void;
}

function AuthForm(props: AuthFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    props.onSubmit({ username: username.trim(), password });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="text-left">
        <label className="sr-only" htmlFor="username">
          username
        </label>

        <input
          autoComplete="username"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
          id="username"
          name="username"
          onChange={(event) => setUsername(event.target.value)}
          placeholder="username"
          type="text"
          value={username}
        />
      </div>

      <div className="text-left">
        <label className="sr-only" htmlFor="password">
          password
        </label>

        <input
          autoComplete="current-password"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="password"
          type="password"
          value={password}
        />

        {props.passwordHint !== "" && (
          <p className="pt-1.5 text-xs font-light text-zinc-500">
            {props.passwordHint}
          </p>
        )}
      </div>

      {props.error !== "" && (
        <p className="text-sm font-light text-rose-400" role="alert">
          {props.error}
        </p>
      )}

      <button
        className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 font-semibold text-zinc-950 transition duration-200 hover:bg-white light:hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={props.pending}
        type="submit"
      >
        {props.pending ? props.pendingLabel : props.submitLabel}
      </button>
    </form>
  );
}

export default AuthForm;
