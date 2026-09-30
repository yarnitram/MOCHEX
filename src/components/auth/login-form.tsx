"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/watchlist";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "auth"
      ? "Authentication failed or was cancelled. Please try again."
      : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function toggleMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    const supabase = createClient();
    let origin = window.location.origin;
    if (origin.includes("0.0.0.0")) {
      origin = origin.replace("0.0.0.0", "localhost");
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // If email confirmation is disabled, a session is returned immediately.
    if (data.session) {
      router.push(next);
      router.refresh();
    } else {
      setNotice(
        "Account created. If email confirmation is enabled, check your inbox to verify before signing in."
      );
    }
  }

  const isSignup = mode === "signup";
  const submitLabel = loading
    ? "Working…"
    : isSignup
      ? "Create account"
      : "Sign in";

  return (
    <div className="w-full max-w-sm">
      <div className="card-base rounded-2xl p-8 shadow-2xl">
        <h1 className="brand-gradient text-4xl font-extrabold tracking-tight mb-1">MOCHEX</h1>
        <p className="text-muted text-xs mb-6">Crypto trading setup journal</p>

        <div className="flex gap-0 border-b border-line mb-6 w-full">
          <button
            type="button"
            onClick={() => toggleMode("signin")}
            className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
              mode === "signin"
                ? "text-accent border-b-2 border-accent font-semibold"
                : "text-muted hover:text-text"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => toggleMode("signup")}
            className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
              mode === "signup"
                ? "text-accent border-b-2 border-accent font-semibold"
                : "text-muted hover:text-text"
            }`}
          >
            Create account
          </button>
        </div>

        {error ? (
          <div className="rounded-xl bg-loss/10 border border-loss/20 text-loss px-3 py-2 mb-4 text-xs">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-xl bg-accent/10 border border-accent/20 text-text px-3 py-2 mb-4 text-xs">
            {notice}
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-line bg-surface/50 hover:bg-surface font-semibold text-sm text-text transition-all duration-150 disabled:opacity-60 cursor-pointer shadow-sm hover:border-line/80"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{googleLoading ? "Redirecting..." : "Continue with Google"}</span>
          </button>

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line/60"></div>
            </div>
            <span className="relative bg-surface px-3 text-[10px] uppercase font-bold tracking-wider text-muted">
              or
            </span>
          </div>

          <form
            onSubmit={isSignup ? handleSignUp : handleSignIn}
            className="flex flex-col gap-3.5"
          >
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-base w-full"
                placeholder="you@example.com"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>Password</span>
              <input
                type="password"
                required
                minLength={isSignup ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-base w-full"
              />
            </label>

            {isSignup && (
              <p className="text-xs text-muted">
                Anyone can create an account — no email confirmation required.
              </p>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="accent-btn mt-2 py-2.5 w-full text-sm font-bold disabled:opacity-60"
            >
              {submitLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}