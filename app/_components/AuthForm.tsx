"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { AlertIcon, EyeIcon, EyeOffIcon, SpinnerIcon } from "./icons";

type Mode = "login" | "register";

interface AuthFormProps {
  minPasswordLength: number;
}

export function AuthForm({ minPasswordLength }: AuthFormProps): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        const reg = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!reg.ok) throw new Error(await readError(reg, "Could not create the account."));
      }

      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!login.ok) throw new Error(await readError(login, "Could not sign in."));

      router.replace("/upload");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form className="vs-stack" onSubmit={(e) => void submit(e)}>
      <div className="vs-field">
        <label className="vs-field-label" htmlFor="auth-email">
          Email
        </label>
        <input
          id="auth-email"
          type="email"
          className="vs-text-input"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="vs-field">
        <label className="vs-field-label" htmlFor="auth-password">
          Password
        </label>
        <div className="vs-password-wrapper">
          <input
            id="auth-password"
            type={showPassword ? "text" : "password"}
            className="vs-text-input vs-password-input"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="vs-password-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        </div>
        {mode === "register" ? (
          <p className="vs-footnote" style={{ margin: 0 }}>
            Password must be at least {minPasswordLength} characters.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="vs-alert vs-alert-error" role="alert">
          <AlertIcon size={16} className="vs-alert-icon" />
          <span style={{ flex: 1 }}>{error}</span>
        </div>
      ) : null}

      <button type="submit" className="vs-btn vs-btn-primary vs-btn-block" disabled={busy}>
        {busy ? (
          <>
            <SpinnerIcon size={16} className="vs-spin" />
            Please wait…
          </>
        ) : mode === "login" ? (
          "Sign in"
        ) : (
          "Create account"
        )}
      </button>

      <div className="vs-auth-foot">
        <button
          type="button"
          className="vs-btn vs-btn-ghost vs-btn-block"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          disabled={busy}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </form>
  );
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}