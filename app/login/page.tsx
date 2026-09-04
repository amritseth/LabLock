import type { Metadata } from "next";
import { SignInForm } from "@/app/components/sign-in-form";
import { isAuthConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Sign in — LabLock",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = isAuthConfigured();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">LabLock pilot</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Sign in</h1>
        {configured ? (
          <div className="mt-5">
            <SignInForm errorCode={error} />
          </div>
        ) : (
          <div className="mt-5 space-y-3 text-sm text-slate-600">
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-medium text-slate-700">
              Sign-in opens in the next slice.
            </p>
            <p>
              The pilot is invite-only. When the operator connects the Supabase project and adds you
              to the allowlist, this page becomes the live sign-in (Google OAuth for college
              accounts, or a one-time code to your email).
            </p>
            <p className="text-xs text-slate-400">
              Until then, this placeholder accepts no data — nothing you type here is stored.
            </p>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-slate-400">
          One trusted register · attendance is not tracked · the database decides who gets the slot
        </p>
      </div>
    </main>
  );
}
