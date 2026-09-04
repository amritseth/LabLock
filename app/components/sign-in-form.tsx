"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics";

export function SignInForm({ errorCode }: { errorCode?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleGoogle() {
    setBusy(true);
    setMessage(null);
    capture("signup_started", { method: "google" });
    const supabase = getSupabaseBrowserClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/api/auth/callback` },
    });
    if (error) {
      setMessage(`Sign-in failed: ${error.message}`);
      setBusy(false);
    }
  }

  async function handleOtp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    capture("signup_started", { method: "email" });
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }, // invite-only pilot
    });
    setBusy(false);
    if (error) {
      setMessage(`Could not send the code: ${error.message}`);
      return;
    }
    setOtpSent(true);
    setMessage(
      "If this address is on the pilot allowlist, a one-time code is on its way (1 hour expiry).",
    );
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim().length !== 6) {
      setMessage("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const started = Date.now();
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      setMessage(`Verification failed: ${error.message}`);
      return;
    }
    capture("signup_completed", { method: "email", duration_ms: Date.now() - started });
    router.push("/availability");
    router.refresh();
  }

  if (errorCode) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Sign-in failed ({errorCode}). Try again, or contact the pilot operator.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleGoogle}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path
            fill="#FFC107"
            d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
          />
          <path
            fill="#FF3D00"
            d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
          />
        </svg>
        Continue with Google (college account)
      </button>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or with a one-time code
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={handleOtp} className="space-y-2">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@college.edu.in"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          autoComplete="email"
        />
        {!otpSent && (
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Email me a code"}
          </button>
        )}
      </form>

      {otpSent && (
        <form onSubmit={handleVerify} className="space-y-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="6-digit code"
            aria-label="One-time code"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-sm font-semibold tracking-[0.3em] focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Verify & sign in"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setOtpSent(false);
              setCode("");
              setMessage(null);
            }}
            className="w-full text-xs font-semibold text-slate-500 hover:underline"
          >
            Use a different address
          </button>
        </form>
      )}

      <p className="text-xs text-slate-500">
        Invite-only pilot — new accounts are created by the operator on the allowlist. Code expires
        in one hour.
      </p>
      {message && <p className="text-xs font-medium text-slate-600">{message}</p>}
    </div>
  );
}

export { SignInForm as default };
