import { useState, type FormEvent } from "react";
import { getErrorMessage } from "../lib/apiClient";
import { useAuth } from "../features/auth/auth-context";

export default function LoginPage() {
  const { login, isLoggingIn, loginError, restoreError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login({ email, password });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl bg-white p-8 shadow"
      >
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sign in to FieldLens</h1>
          <p className="mt-1 text-sm text-slate-600">Enter your email and password to continue.</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        {loginError !== null && (
          <p role="alert" className="text-sm text-red-700">
            {getErrorMessage(loginError)}
          </p>
        )}

        {restoreError !== null && loginError === null && (
          <p role="status" className="text-sm text-amber-700">
            Could not restore your session: {getErrorMessage(restoreError)}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoggingIn}
          className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoggingIn ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
