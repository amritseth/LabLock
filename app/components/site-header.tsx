import Link from "next/link";
import { getSessionActor } from "@/lib/supabase/server";

export async function SiteHeader() {
  const actor = await getSessionActor();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-ink-900">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-xs font-black text-white">
            LK
          </span>
          LabLock
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium text-slate-600">
          <Link
            href="/#problem"
            className="hidden rounded-md px-3 py-1.5 hover:bg-slate-100 sm:block"
          >
            The problem
          </Link>
          <Link
            href="/availability"
            className="rounded-md px-3 py-1.5 hover:bg-slate-100"
            aria-label="View availability"
          >
            Availability
          </Link>
          {actor?.role === "operator" && (
            <Link href="/admin" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Operator
            </Link>
          )}
          {actor ? (
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-700"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
