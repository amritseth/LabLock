"use client";

/**
 * Global error boundary (handbook §7 repository tree).
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div className="max-w-md">
          <p className="text-sm font-semibold tracking-widest text-brand-600 uppercase">LabLock</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            The request failed before the page could render. If this keeps happening, tell the pilot
            operator — the error has been recorded with the request digest{" "}
            <code className="rounded bg-slate-100 px-1">{error.digest ?? "n/a"}</code>.
          </p>
          <button
            onClick={reset}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
